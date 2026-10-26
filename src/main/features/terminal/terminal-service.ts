// Starts Claude (or a shell) for a project inside a pty. Claude runs as the pty process itself,
// with argv only — no shell string, no quoting rules (ADR-0013). A project may have several tabs.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from '@shared/cli-args'
import type {
  ClaudeLaunchMode,
  ConversationView,
  PermissionMode,
  Settings,
  TerminalInfo,
  TerminalKind,
  TerminalStartRequest,
  TerminalStartResult,
  TrellisEvent,
} from '@shared/types'
import { newId } from '../../lib/ids'
import { logFailure } from '../../lib/log'
import { KeyedSerialQueue } from '../../lib/serial'
import { ensureUtf8Locale, getEnv, sanitizeChildEnv, setEnv } from '../../platform/env'
import { defaultShell } from '../../platform/shells'
import { findExecutable, spawnTarget } from '../../platform/which'
import type { AgentAdapter } from '../agents'
import type { ProjectRegistry } from '../projects'
import { chooseLaunch, isSessionId, listConversations } from './conversations'
import { PtyManager, type SpawnPlan } from './pty-manager'

/** A continue or resume that dies this fast without events is treated as "nothing to open". */
const CONTINUE_GRACE_MS = 20_000
const BEFORE_LAUNCH_TIMEOUT_MS = 4000

export interface TerminalServiceDeps {
  ptys: PtyManager
  registry: ProjectRegistry
  adapter: AgentAdapter
  settings: () => Settings
  baseEnv: () => Promise<NodeJS.ProcessEnv>
  bridge: () => { token: string; configFile: string }
  /** Runs before the first Claude of a project starts (the "this run" baseline). Bounded. */
  beforeClaudeLaunch: (projectId: string, root: string) => Promise<void>
  /** A Claude process was started (the agent does not report session starts over HTTP). */
  onClaudeLaunched: (launch: {
    projectId: string
    terminalId: string
    sessionId: string | null
    mode: ClaudeLaunchMode
  }) => void
  /** The project's ledger, far enough back to list its conversations (ADR-0035). */
  ledger: (projectId: string) => Promise<TrellisEvent[]>
}

type TerminalSeed = Omit<TerminalInfo, 'running' | 'exitCode' | 'startedAt'>

export class TerminalService {
  /** Terminals that have reported at least one agent event (proves the session is alive). */
  private readonly sawEvents = new Set<string>()
  /** `chosen`: the human picked the conversation, so a failed open is shown, not replaced. */
  private readonly launches = new Map<
    string,
    {
      mode: ClaudeLaunchMode
      chosen: boolean
      permissionMode: PermissionMode
      startedAt: number
      retried: boolean
    }
  >()
  /** Two quick start requests for the same project must not create two terminals. */
  private readonly startQueue = new KeyedSerialQueue()

  constructor(private readonly deps: TerminalServiceDeps) {
    deps.ptys.on('exit', (info, output) => this.handleExit(info, output))
    deps.ptys.on('removed', (terminalId) => {
      this.sawEvents.delete(terminalId)
      this.launches.delete(terminalId)
    })
  }

  /**
   * Called for every agent event so we can learn the session id behind a terminal. After `/clear`
   * the tab's next conversation is unknown until its first prompt (ADR-0035).
   */
  noteAgentEvent(terminalId: string | null, event: TrellisEvent): void {
    if (!terminalId) return
    this.sawEvents.add(terminalId)
    const info = this.deps.ptys.get(terminalId)
    if (!info) return
    const cleared = event.kind === 'session.end' && event.data.reason === 'clear'
    const sessionId = cleared ? null : event.sessionId
    if ((cleared || sessionId) && info.sessionId !== sessionId)
      this.deps.ptys.update(terminalId, { sessionId })
  }

  /** Conversations of the project to open again, most recent first. */
  async conversations(projectId: string): Promise<ConversationView[]> {
    const project = this.deps.registry.get(projectId)
    if (!project) return []
    const [events, env] = await Promise.all([this.deps.ledger(projectId), this.childEnv()])
    return listConversations(this.deps.adapter, events, project.path, env)
  }

  start(req: TerminalStartRequest): Promise<TerminalStartResult> {
    return this.startQueue.run(req.projectId, () => this.startNow(req))
  }

  private ofProject(projectId: string, kind?: TerminalKind): TerminalInfo[] {
    return this.deps.ptys
      .list()
      .filter((t) => t.projectId === projectId && (!kind || t.kind === kind))
      .sort((a, b) => a.index - b.index)
  }

  private async startNow(req: TerminalStartRequest): Promise<TerminalStartResult> {
    const project = this.deps.registry.get(req.projectId)
    if (!project || !existsSync(project.path)) {
      return { ok: false, reason: 'project-missing', message: project?.path ?? req.projectId }
    }
    const siblings = this.ofProject(project.id, req.kind)
    const existing = req.terminalId
      ? siblings.find((t) => t.id === req.terminalId)
      : req.newTab
        ? undefined
        : siblings[0]
    if (existing?.running) return { ok: true, terminal: existing }
    const index = existing?.index ?? Math.max(0, ...siblings.map((t) => t.index)) + 1

    const env = await this.childEnv()
    if (req.kind === 'shell') {
      const shell = defaultShell(env)
      const seed: TerminalSeed = {
        id: existing?.id ?? newId(),
        projectId: project.id,
        kind: 'shell',
        title: shell.name,
        index,
        sessionId: null,
        permissionMode: null,
      }
      return this.spawnOrRestart(
        existing,
        seed,
        { file: shell.file, args: shell.args, cwd: project.path, env },
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
    const others = this.ofProject(project.id, 'claude').filter(
      (t) => t.running && t.id !== existing?.id,
    )
    const otherClaudeRunning = others.length > 0
    const chosen = isSessionId(req.sessionId) ? req.sessionId : null
    if (chosen && others.some((t) => t.sessionId === chosen))
      return { ok: false, reason: 'session-in-use', message: chosen }
    const { mode, sessionId } = await chooseLaunch({
      chosen,
      mode: req.mode ?? this.deps.settings().claude.defaultMode,
      otherClaudeRunning,
      conversations: () => this.conversations(project.id),
      hasPriorSession: () => this.deps.adapter.hasPriorSession(project.path, env),
    })
    const permissionMode = req.permissionMode ?? this.deps.settings().claude.permissionMode
    const terminalId = existing?.id ?? newId()
    const { token, configFile } = this.deps.bridge()
    const args = this.deps.adapter.launchArgs({
      mode,
      permissionMode,
      sessionId,
      extraArgs: parseArgs(this.deps.settings().claude.extraArgs),
      bridgeConfigFile: configFile,
    })
    const plan = this.wrap({
      file: executable,
      args,
      cwd: project.path,
      env: { ...env, ...this.deps.adapter.bridgeEnv(token, project.id, terminalId) },
    })

    // The baseline must exist before Claude can touch anything, or early edits would hide in it.
    // Extra tabs keep the baseline of the run already in progress.
    if (!otherClaudeRunning) {
      await Promise.race([
        this.deps
          .beforeClaudeLaunch(project.id, project.path)
          .catch(logFailure('terminal', 'session baseline snapshot failed')),
        new Promise((resolve) => setTimeout(resolve, BEFORE_LAUNCH_TIMEOUT_MS)),
      ])
    }

    this.sawEvents.delete(terminalId)
    this.launches.set(terminalId, {
      mode,
      chosen: chosen !== null,
      permissionMode,
      startedAt: Date.now(),
      retried: false,
    })
    const seed: TerminalSeed = {
      id: terminalId,
      projectId: project.id,
      kind: 'claude',
      title: 'Claude',
      index,
      sessionId,
      permissionMode,
    }
    const result = this.spawnOrRestart(existing, seed, plan, req)
    if (result.ok)
      this.deps.onClaudeLaunched({ projectId: project.id, terminalId, sessionId, mode })
    return result
  }

  private spawnOrRestart(
    existing: TerminalInfo | undefined,
    seed: TerminalSeed,
    plan: SpawnPlan,
    req: TerminalStartRequest,
  ): TerminalStartResult {
    try {
      const terminal = existing
        ? this.deps.ptys.restart(existing.id, plan, {
            sessionId: seed.sessionId,
            title: seed.title,
            permissionMode: seed.permissionMode,
          })
        : this.deps.ptys.create(seed, plan, req.cols || 100, req.rows || 30)
      if (!terminal) return { ok: false, reason: 'spawn-failed', message: 'terminal vanished' }
      return { ok: true, terminal }
    } catch (error) {
      return { ok: false, reason: 'spawn-failed', message: (error as Error).message }
    }
  }

  private handleExit(info: TerminalInfo, output: string): void {
    if (info.kind !== 'claude') return
    const launch = this.launches.get(info.id)
    if (
      launch &&
      launch.mode !== 'new' &&
      !launch.chosen &&
      !launch.retried &&
      info.exitCode !== 0 &&
      Date.now() - launch.startedAt < CONTINUE_GRACE_MS &&
      !this.sawEvents.has(info.id) &&
      this.deps.adapter.isNothingToContinue(output)
    ) {
      launch.retried = true
      void this.start({
        projectId: info.projectId,
        kind: 'claude',
        mode: 'new',
        permissionMode: launch.permissionMode,
        terminalId: info.id,
        cols: 0,
        rows: 0,
      })
    }
  }

  /** The agent executable and the environment it runs with (also used for headless analysis). */
  async agentLaunch(): Promise<{ executable: string | null; env: Record<string, string> }> {
    const env = await this.childEnv()
    return { executable: this.resolveAgent(env), env }
  }

  private resolveAgent(env: Record<string, string>): string | null {
    const configured = this.deps.settings().claude.path.trim()
    if (configured) return existsSync(configured) ? configured : null
    return findExecutable(this.deps.adapter.executableName, env)
  }

  private wrap(plan: SpawnPlan): SpawnPlan {
    return { ...plan, ...spawnTarget(plan.file, plan.args, plan.env) }
  }

  private async childEnv(): Promise<Record<string, string>> {
    const env = sanitizeChildEnv(await this.deps.baseEnv())
    this.deps.adapter.scrubInheritedEnv(env)
    setEnv(env, 'TERM', 'xterm-256color')
    setEnv(env, 'COLORTERM', 'truecolor')
    ensureUtf8Locale(env)
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
