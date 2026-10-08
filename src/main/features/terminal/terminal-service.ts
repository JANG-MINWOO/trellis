// Starts Claude (or a shell) for a project inside a pty. Claude runs as the pty process itself,
// with argv only — no shell string, no quoting rules (ADR-0013).
import { existsSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from '@shared/cli-args'
import type {
  LaunchMode,
  Settings,
  TerminalInfo,
  TerminalStartRequest,
  TerminalStartResult,
} from '@shared/types'
import { newId } from '../../lib/ids'
import { KeyedSerialQueue } from '../../lib/serial'
import { getEnv, sanitizeChildEnv, setEnv } from '../../platform/env'
import { defaultShell } from '../../platform/shells'
import { findExecutable, needsCmdWrapper } from '../../platform/which'
import type { AgentAdapter } from '../agents'
import type { ProjectRegistry } from '../projects'
import { PtyManager, type SpawnPlan } from './pty-manager'

/** A continue attempt that dies this fast without events is treated as "nothing to continue". */
const CONTINUE_GRACE_MS = 20_000

export interface TerminalServiceDeps {
  ptys: PtyManager
  registry: ProjectRegistry
  adapter: AgentAdapter
  settings: () => Settings
  baseEnv: () => Promise<NodeJS.ProcessEnv>
  bridge: () => { token: string; configFile: string }
  /** Runs before Claude starts (e.g. the "this run" baseline). Bounded so launch never hangs. */
  beforeClaudeLaunch: (projectId: string, root: string) => Promise<void>
}

const BEFORE_LAUNCH_TIMEOUT_MS = 4000

export class TerminalService {
  /** Terminals that have reported at least one agent event (proves the session is alive). */
  private readonly sawEvents = new Set<string>()
  private readonly launchModes = new Map<
    string,
    { mode: LaunchMode; startedAt: number; retried: boolean }
  >()
  /** Two quick start requests for the same project must not create two terminals. */
  private readonly startQueue = new KeyedSerialQueue()

  constructor(private readonly deps: TerminalServiceDeps) {
    deps.ptys.on('exit', (info, output) => this.handleExit(info, output))
  }

  /** Called for every agent event so we can learn the session id behind a terminal. */
  noteAgentEvent(terminalId: string | null, sessionId: string | null): void {
    if (!terminalId) return
    this.sawEvents.add(terminalId)
    const info = this.deps.ptys.get(terminalId)
    if (info && sessionId && info.sessionId !== sessionId)
      this.deps.ptys.update(terminalId, { sessionId })
  }

  start(req: TerminalStartRequest): Promise<TerminalStartResult> {
    return this.startQueue.run(`${req.projectId}:${req.kind}`, () => this.startNow(req))
  }

  private async startNow(req: TerminalStartRequest): Promise<TerminalStartResult> {
    const project = this.deps.registry.get(req.projectId)
    if (!project || !existsSync(project.path)) {
      return { ok: false, reason: 'project-missing', message: project?.path ?? req.projectId }
    }
    const existing = this.deps.ptys
      .list()
      .find((t) => t.projectId === project.id && t.kind === req.kind)
    if (existing?.running) return { ok: true, terminal: existing }

    const env = await this.childEnv()
    if (req.kind === 'shell') {
      const shell = defaultShell(env)
      const plan: SpawnPlan = { file: shell.file, args: shell.args, cwd: project.path, env }
      return this.spawnOrRestart(
        existing,
        { id: newId(), projectId: project.id, kind: 'shell', title: shell.name, sessionId: null },
        plan,
        req,
      )
    }

    const executable = this.resolveAgent(env)
    if (!executable) {
      return {
        ok: false,
        reason: 'agent-not-found',
        message: this.deps.settings().claude.path || this.deps.adapter.executableName,
      }
    }
    let mode = req.mode ?? this.deps.settings().claude.defaultMode
    if (mode === 'continue' && !(await this.deps.adapter.hasPriorSession(project.path, env)))
      mode = 'new'

    const terminalId = existing?.id ?? newId()
    const sessionId = mode === 'new' ? newId() : null
    const { token, configFile } = this.deps.bridge()
    const args = this.deps.adapter.launchArgs({
      mode,
      sessionId,
      extraArgs: parseArgs(this.deps.settings().claude.extraArgs),
      bridgeConfigFile: configFile,
    })
    const agentEnv = { ...env, ...this.deps.adapter.bridgeEnv(token, project.id, terminalId) }
    const plan = this.wrap({ file: executable, args, cwd: project.path, env: agentEnv })

    // The baseline must exist before Claude can touch anything, or early edits would hide in it.
    await Promise.race([
      this.deps.beforeClaudeLaunch(project.id, project.path).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, BEFORE_LAUNCH_TIMEOUT_MS)),
    ])

    this.sawEvents.delete(terminalId)
    this.launchModes.set(terminalId, { mode, startedAt: Date.now(), retried: false })
    return this.spawnOrRestart(
      existing,
      { id: terminalId, projectId: project.id, kind: 'claude', title: 'Claude', sessionId },
      plan,
      req,
    )
  }

  private spawnOrRestart(
    existing: TerminalInfo | undefined,
    info: Omit<TerminalInfo, 'running' | 'exitCode' | 'startedAt'>,
    plan: SpawnPlan,
    req: TerminalStartRequest,
  ): TerminalStartResult {
    try {
      const terminal = existing
        ? this.deps.ptys.restart(existing.id, plan, {
            sessionId: info.sessionId,
            title: info.title,
          })
        : this.deps.ptys.create(info, plan, req.cols, req.rows)
      if (!terminal) return { ok: false, reason: 'spawn-failed', message: 'terminal vanished' }
      return { ok: true, terminal }
    } catch (error) {
      return { ok: false, reason: 'spawn-failed', message: (error as Error).message }
    }
  }

  private handleExit(info: TerminalInfo, output: string): void {
    if (info.kind !== 'claude') return
    const launch = this.launchModes.get(info.id)
    if (
      launch &&
      launch.mode === 'continue' &&
      !launch.retried &&
      info.exitCode !== 0 &&
      Date.now() - launch.startedAt < CONTINUE_GRACE_MS &&
      !this.sawEvents.has(info.id) &&
      this.deps.adapter.isNothingToContinue(output)
    ) {
      launch.retried = true
      void this.start({ projectId: info.projectId, kind: 'claude', mode: 'new', cols: 0, rows: 0 })
    }
  }

  private resolveAgent(env: Record<string, string>): string | null {
    const configured = this.deps.settings().claude.path.trim()
    if (configured) return existsSync(configured) ? configured : null
    return findExecutable(this.deps.adapter.executableName, env)
  }

  /** Windows .cmd shims (npm installs) cannot be spawned directly. */
  private wrap(plan: SpawnPlan): SpawnPlan {
    if (!needsCmdWrapper(plan.file)) return plan
    const cmd = getEnv(plan.env, 'ComSpec') ?? 'cmd.exe'
    return { ...plan, file: cmd, args: ['/d', '/c', plan.file, ...plan.args] }
  }

  private async childEnv(): Promise<Record<string, string>> {
    const env = sanitizeChildEnv(await this.deps.baseEnv())
    setEnv(env, 'TERM', 'xterm-256color')
    setEnv(env, 'COLORTERM', 'truecolor')
    // Finder-launched apps often lack a UTF-8 locale; Korean text would break without one.
    if (process.platform !== 'win32' && !getEnv(env, 'LANG') && !getEnv(env, 'LC_ALL'))
      setEnv(env, 'LANG', 'en_US.UTF-8')
    // Make sure the folder of the agent binary is on PATH for anything it spawns.
    const agent = this.resolveAgent(env)
    if (agent) {
      const dir = path.dirname(agent)
      const current = getEnv(env, 'PATH') ?? ''
      if (!current.split(path.delimiter).includes(dir))
        setEnv(env, 'PATH', [current, dir].filter(Boolean).join(path.delimiter))
    }
    return env
  }
}
