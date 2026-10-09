// IPC for the intent layer: decision candidates, behavior specs and feature areas (M2, M4).
import { ipcMain } from 'electron'
import { areaOf } from '@shared/areas'
import { Invoke } from '@shared/ipc'
import type {
  BehaviorResolution,
  DecisionResolution,
  EventOf,
  Language,
  Project,
  TrellisEvent,
} from '@shared/types'
import type { AppContext } from './context'
import { writeDecisionRecord } from './features/decisions'
import { applyBehavior, listSpecs } from './features/specs'
import { newId } from './lib/ids'

const asString = (v: unknown): string => (typeof v === 'string' ? v : '')

export function registerIntentIpc(ctx: AppContext): void {
  const project = (id: unknown): Project => {
    const p = ctx.registry.get(asString(id))
    if (!p) throw new Error(`Unknown project: ${String(id)}`)
    return p
  }
  const lang = (p: Project): Language => p.recordLanguage ?? ctx.settings.get().language ?? 'en'
  const append = (
    p: Project,
    base: { promptId: string | null; terminalId: string | null; sessionId: string | null },
    event: Pick<TrellisEvent, 'kind' | 'data'>,
  ): Promise<void> =>
    ctx.events.append({
      id: newId(),
      ts: Date.now(),
      projectId: p.id,
      agent: 'trellis',
      sessionId: base.sessionId,
      promptId: base.promptId,
      terminalId: base.terminalId,
      ...event,
    } as TrellisEvent)
  /** The candidate event, if it exists and is still unresolved. */
  const findOpen = async <K extends 'decision.candidate' | 'behavior.candidate'>(
    p: Project,
    kind: K,
    candidateId: string,
  ): Promise<EventOf<K> | null> => {
    const events = await ctx.events.list(p.id, 20_000)
    const resolvedKind = kind === 'decision.candidate' ? 'decision.resolved' : 'behavior.resolved'
    if (events.some((e) => e.kind === resolvedKind && e.data.candidateId === candidateId))
      return null
    return (
      (events.find((e) => e.kind === kind && e.data.candidateId === candidateId) as
        EventOf<K> | undefined) ?? null
    )
  }

  ipcMain.handle(
    Invoke.decisionsResolve,
    async (_e, id: unknown, candidateId: unknown, answer: unknown) => {
      const p = project(id)
      const a = (answer ?? {}) as Partial<DecisionResolution>
      const candidate = await findOpen(p, 'decision.candidate', asString(candidateId))
      if (!candidate) return { ok: false, docPath: null, message: 'not-found' }
      const accepted = a.resolution === 'accepted'
      const reason = asString(a.reason).slice(0, 4000)
      const reasonFromGuess = Boolean(a.reasonFromGuess)
      try {
        const docPath = accepted
          ? await writeDecisionRecord(
              p.path,
              p.decisionsDir,
              candidate.data,
              { reason, reasonFromGuess },
              lang(p),
            )
          : null
        await append(p, candidate, {
          kind: 'decision.resolved',
          data: {
            candidateId: candidate.data.candidateId,
            resolution: accepted ? 'accepted' : 'dismissed',
            reason,
            reasonFromGuess,
            docPath,
          },
        })
        return { ok: true, docPath }
      } catch (error) {
        return { ok: false, docPath: null, message: (error as Error).message }
      }
    },
  )

  ipcMain.handle(Invoke.specsList, async (_e, id: unknown) => {
    const p = project(id)
    const inRepo = (await ctx.changes.repoInfo(p.path)) !== null
    return listSpecs(p.path, p.specsDir, await ctx.git(), inRepo)
  })

  ipcMain.handle(
    Invoke.behaviorsResolve,
    async (_e, id: unknown, candidateId: unknown, answer: unknown) => {
      const p = project(id)
      const a = (answer ?? {}) as Partial<BehaviorResolution>
      const candidate = await findOpen(p, 'behavior.candidate', asString(candidateId))
      if (!candidate) return { ok: false, specPath: null, message: 'not-found' }
      const accepted = a.resolution === 'accepted'
      const statement = asString(a.statement).trim() || candidate.data.statement
      const area = asString(a.area).trim() || candidate.data.area
      try {
        const written = accepted
          ? await applyBehavior(
              p.path,
              p.specsDir,
              {
                op: candidate.data.op,
                kind: candidate.data.kind,
                targetId: candidate.data.targetId,
                area,
                statement,
              },
              lang(p),
            )
          : null
        await append(p, candidate, {
          kind: 'behavior.resolved',
          data: {
            candidateId: candidate.data.candidateId,
            resolution: accepted ? 'accepted' : 'dismissed',
            statement,
            area,
            specPath: written?.specPath ?? null,
            itemId: written?.itemId ?? null,
          },
        })
        return { ok: true, specPath: written?.specPath ?? null }
      } catch (error) {
        return { ok: false, specPath: null, message: (error as Error).message }
      }
    },
  )

  ipcMain.handle(
    Invoke.behaviorsFromIntent,
    async (_e, id: unknown, lines: unknown, area: unknown) => {
      const p = project(id)
      const list = (Array.isArray(lines) ? lines : [])
        .map((l) =>
          asString(l)
            .replace(/^[-*•]\s*/, '')
            .trim(),
        )
        .filter(Boolean)
      for (const statement of list.slice(0, 20)) {
        await append(
          p,
          { promptId: null, terminalId: null, sessionId: null },
          {
            kind: 'behavior.candidate',
            data: {
              candidateId: newId(),
              source: 'intent',
              op: 'add',
              kind: 'invariant',
              area: asString(area).trim() || p.name,
              targetId: null,
              statement,
              files: [],
            },
          },
        )
      }
    },
  )

  ipcMain.handle(Invoke.projectAreas, async (_e, id: unknown) => {
    const p = project(id)
    const git = await ctx.git()
    const out = git
      ? await git.tryRun(p.path, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
      : null
    if (!out) return []
    const counts = new Map<string, number>()
    for (const file of out.split('\0'))
      if (file) counts.set(areaOf(file), (counts.get(areaOf(file)) ?? 0) + 1)
    return [...counts.entries()]
      .map(([area, files]) => ({ area, files }))
      .sort((a, b) => b.files - a.files)
      .slice(0, 30)
  })
}
