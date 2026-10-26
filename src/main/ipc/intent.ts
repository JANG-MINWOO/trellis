// The intent layer (M2, M4): the ledger, intents, decision candidates and behavior specs.
import { Invoke } from '@shared/ipc'
import { normalizeIntentInput, normalizeTaskContinue, normalizeTaskDone } from '@shared/intent'
import { recordLanguageOf } from '@shared/settings'
import type { AppContext } from '../context'
import { listDecisionDocs, resolveDecision } from '../features/decisions'
import { trellisEvent, type EventRef } from '../features/events'
import { newId } from '../lib/ids'
import { invariantsFromIntent, listSpecs, resolveBehavior } from '../features/specs'
import { asString, handle, projectOf } from './common'

export function registerIntentIpc(ctx: AppContext): void {
  const project = (id: unknown) => projectOf(ctx, id)

  // The tab's conversation as main knows it (null while unknown: then the tab's next prompt
  // decides, ADR-0035). The renderer only names the tab.
  const tabOf = (projectId: string, terminalId: unknown): EventRef => {
    const tab = typeof terminalId === 'string' ? ctx.ptys.get(terminalId) : undefined
    return tab?.projectId === projectId && tab.kind === 'claude'
      ? { sessionId: tab.sessionId, promptId: null, terminalId: tab.id }
      : { sessionId: null, promptId: null, terminalId: null }
  }

  handle(Invoke.eventsList, (id, limit) =>
    ctx.events.list(project(id).id, typeof limit === 'number' ? limit : undefined),
  )
  handle(Invoke.intentSave, async (id, input, terminalId) => {
    const p = project(id)
    const data = normalizeIntentInput(input)
    data.taskId ??= newId()
    data.scope = 'conversation'
    const event = trellisEvent(p.id, 'intent.set', data, tabOf(p.id, terminalId))
    await ctx.events.append(event)
    return event
  })
  handle(Invoke.intentDone, async (id, taskId, at) => {
    const data = normalizeTaskDone(taskId, at)
    if (data) await ctx.events.append(trellisEvent(project(id).id, 'intent.done', data))
  })
  handle(Invoke.intentKeep, async (id, taskId, terminalId, from) => {
    const p = project(id)
    const data = normalizeTaskContinue(taskId, from)
    if (data)
      await ctx.events.append(trellisEvent(p.id, 'intent.continue', data, tabOf(p.id, terminalId)))
  })

  handle(Invoke.decisionsList, (id) => {
    const p = project(id)
    return listDecisionDocs(p.path, p.decisionsDir)
  })
  handle(Invoke.decisionsResolve, (id, candidateId, answer) => {
    const p = project(id)
    const lang = recordLanguageOf(p, ctx.settings.get())
    return resolveDecision(ctx.events, p, lang, asString(candidateId), answer)
  })

  handle(Invoke.specsList, async (id) => {
    const p = project(id)
    const inRepo = (await ctx.changes.repoInfo(p.path)) !== null
    return listSpecs(p.path, p.specsDir, await ctx.git(), inRepo)
  })
  handle(Invoke.behaviorsResolve, (id, candidateId, answer) => {
    const p = project(id)
    const lang = recordLanguageOf(p, ctx.settings.get())
    return resolveBehavior(ctx.events, p, lang, asString(candidateId), answer)
  })
  handle(Invoke.behaviorsFromIntent, (id, lines, area) =>
    invariantsFromIntent(ctx.events, project(id), lines, area),
  )
}
