// After a turn ends: ask the agent (isolated, tool-less) which decisions and behavior changes the
// turn contains, add risk-area cards, and record everything as candidates for a human (M2, M4).
import { pendingDecisions } from '@shared/decisions'
import { matchesAny } from '@shared/glob'
import type { Language, Project, Settings, TrellisEvent } from '@shared/types'
import { newId } from '../../lib/ids'
import { KeyedSerialQueue } from '../../lib/serial'
import type { AgentAdapter } from '../agents'
import type { ChangesService, Git, TurnChanges } from '../changes'
import { listDecisionDocs } from '../decisions'
import type { EventStore } from '../events'
import { listSpecs } from '../specs'
import { runHeadless } from './headless'
import { ANALYSIS_SCHEMA, buildTurnPrompt, riskAreaCandidates, toCandidates } from './turn-prompt'

const TIMEOUT_MS = 180_000

export interface TurnRef {
  promptId: string
  sessionId: string | null
  terminalId: string | null
}

export interface TurnAnalyzerDeps {
  adapter: AgentAdapter
  events: EventStore
  changes: ChangesService
  settings: () => Settings
  git: () => Promise<Git | null>
  /** The agent executable and the environment Trellis launches it with. */
  agent: () => Promise<{ executable: string | null; env: Record<string, string> }>
  onStatus: (projectId: string, running: boolean) => void
}

export class TurnAnalyzer {
  private readonly queue = new KeyedSerialQueue()

  constructor(private readonly deps: TurnAnalyzerDeps) {}

  analyze(project: Project, turn: TurnRef, changes: TurnChanges): Promise<void> {
    return this.queue.run(project.id, () => this.run(project, turn, changes))
  }

  private lang(project: Project): Language {
    return project.recordLanguage ?? this.deps.settings().language ?? 'en'
  }

  private async run(project: Project, turn: TurnRef, changes: TurnChanges): Promise<void> {
    if (changes.files.length === 0) return
    const lang = this.lang(project)
    const events = await this.deps.events.list(project.id, 4000)
    const git = await this.deps.git()
    const inRepo = (await this.deps.changes.repoInfo(project.path)) !== null
    const [records, specs] = await Promise.all([
      listDecisionDocs(project.path, project.decisionsDir),
      listSpecs(project.path, project.specsDir, git, inRepo),
    ])
    // Do not ask again about what is already recorded, pending, or was dismissed.
    const titles = [
      ...(records.kind === 'ok'
        ? records.docs.map((d) => d.title.replace(/^ADR-\d+:\s*/, ''))
        : []),
      ...events
        .filter((e) => e.kind === 'decision.candidate')
        .map((e) => (e.kind === 'decision.candidate' ? e.data.title : '')),
    ].filter(Boolean)
    const specItems = specs.areas.flatMap((a) => a.items)

    let decisions: ReturnType<typeof toCandidates>['decisions'] = []
    let behaviors: ReturnType<typeof toCandidates>['behaviors'] = []
    if (project.analysisEnabled) {
      this.deps.onStatus(project.id, true)
      const started = Date.now()
      const model = this.deps.settings().analysis.model
      try {
        const riskFiles = new Set(
          changes.files.filter((f) => matchesAny(f.path, project.riskAreas)).map((f) => f.path),
        )
        const patch = await this.deps.changes.turnPatch(
          project.path,
          changes.startTree,
          changes.endTree,
          changes.files,
          riskFiles,
        )
        const ctx = {
          projectName: project.name,
          lang,
          intent: intentBefore(events, turn.promptId),
          prompt: textOf(events, 'prompt.submit', turn.promptId),
          lastMessage: textOf(events, 'turn.stop', turn.promptId),
          files: changes.files,
          patch,
          decisionTitles: titles.slice(-60),
          specItems: specItems.slice(0, 200),
        }
        const { executable, env } = await this.deps.agent()
        if (!executable) throw new Error('agent-not-found')
        const result = await runHeadless(
          executable,
          this.deps.adapter.headlessArgs({ schema: ANALYSIS_SCHEMA, model }),
          env,
          buildTurnPrompt(ctx),
          TIMEOUT_MS,
        )
        const parsed = result.timedOut
          ? { ok: false as const, message: 'timeout' }
          : this.deps.adapter.parseHeadless(result.stdout)
        if (!parsed.ok) throw new Error(parsed.message || result.stderr.slice(0, 300))
        ;({ decisions, behaviors } = toCandidates(parsed.data, ctx, newId))
        await this.record(project, turn, 'analysis.run', {
          status: 'ok',
          durationMs: Date.now() - started,
          model,
          decisions: decisions.length,
          behaviors: behaviors.length,
          message: null,
        })
      } catch (error) {
        await this.record(project, turn, 'analysis.run', {
          status: 'error',
          durationMs: Date.now() - started,
          model,
          decisions: 0,
          behaviors: 0,
          message: (error as Error).message.slice(0, 300),
        })
      } finally {
        this.deps.onStatus(project.id, false)
      }
    }

    const covered = new Set(decisions.flatMap((d) => d.files))
    const pendingRisk = new Set(
      pendingDecisions(events)
        .filter((d) => d.source === 'risk-area')
        .flatMap((d) => d.files),
    )
    const risk = riskAreaCandidates(
      changes.files.filter((f) => !pendingRisk.has(f.path)),
      project.riskAreas,
      covered,
      lang,
      newId,
    )
    for (const data of [...decisions, ...risk])
      await this.record(project, turn, 'decision.candidate', data)
    for (const data of behaviors) await this.record(project, turn, 'behavior.candidate', data)
  }

  private record<K extends TrellisEvent['kind']>(
    project: Project,
    turn: TurnRef,
    kind: K,
    data: Extract<TrellisEvent, { kind: K }>['data'],
  ): Promise<void> {
    return this.deps.events.append({
      id: newId(),
      ts: Date.now(),
      projectId: project.id,
      agent: 'trellis',
      sessionId: turn.sessionId,
      promptId: turn.promptId,
      terminalId: turn.terminalId,
      kind,
      data,
    } as TrellisEvent)
  }
}

function textOf(
  events: readonly TrellisEvent[],
  kind: 'prompt.submit' | 'turn.stop',
  promptId: string,
): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!
    if (e.promptId !== promptId) continue
    if (kind === 'prompt.submit' && e.kind === 'prompt.submit') return e.data.prompt
    if (kind === 'turn.stop' && e.kind === 'turn.stop') return e.data.lastMessage
  }
  return ''
}

/** The intent the human wrote last before this turn's prompt. */
function intentBefore(events: readonly TrellisEvent[], promptId: string): string | null {
  const prompt = events.find((e) => e.kind === 'prompt.submit' && e.promptId === promptId)
  const before = prompt?.ts ?? Infinity
  let latest: string | null = null
  for (const e of events) if (e.kind === 'intent.set' && e.ts <= before) latest = e.data.text
  return latest
}
