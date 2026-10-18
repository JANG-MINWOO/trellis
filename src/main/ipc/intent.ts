// The intent layer (M2, M4): the ledger, intents, decision candidates and behavior specs.
import { Invoke } from '@shared/ipc'
import { normalizeIntentInput, normalizeTaskDone, normalizeTaskId } from '@shared/intent'
import { recordLanguageOf } from '@shared/settings'
import type { AppContext } from '../context'
import { listDecisionDocs, resolveDecision } from '../features/decisions'
import { trellisEvent } from '../features/events'
import { newId } from '../lib/ids'
import { invariantsFromIntent, listSpecs, resolveBehavior } from '../features/specs'
import { asString, handle, projectOf } from './common'

export function registerIntentIpc(ctx: AppContext): void {
  const project = (id: unknown) => projectOf(ctx, id)

  handle(Invoke.eventsList, (id, limit) =>
    ctx.events.list(project(id).id, typeof limit === 'number' ? limit : undefined),
  )
  handle(Invoke.intentSave, async (id, input) => {
    const data = normalizeIntentInput(input)
    data.taskId ??= newId()
    const event = trellisEvent(project(id).id, 'intent.set', data)
    await ctx.events.append(event)
    return event
  })
  handle(Invoke.intentDone, async (id, taskId, at) => {
    const data = normalizeTaskDone(taskId, at)
    if (data) await ctx.events.append(trellisEvent(project(id).id, 'intent.done', data))
  })
  handle(Invoke.intentKeep, async (id, taskId) => {
    const task = normalizeTaskId(taskId)
    if (task)
      await ctx.events.append(trellisEvent(project(id).id, 'intent.continue', { taskId: task }))
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
