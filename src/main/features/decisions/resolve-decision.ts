import type { DecisionResolution, Language, Project } from '@shared/types'
import { trellisEvent, type EventStore } from '../events'
import { writeDecisionRecord } from './decision-writer'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * The human's answer to a decision card: an accepted decision becomes a record file (when the
 * project keeps records), and the answer itself always goes into the ledger.
 */
export async function resolveDecision(
  events: EventStore,
  project: Project,
  lang: Language,
  candidateId: string,
  answer: unknown,
): Promise<{ ok: boolean; docPath: string | null; message?: string }> {
  const a = (answer && typeof answer === 'object' ? answer : {}) as Partial<DecisionResolution>
  const candidate = await events.openCandidate(project.id, 'decision.candidate', candidateId)
  if (!candidate) return { ok: false, docPath: null, message: 'not-found' }
  const accepted = a.resolution === 'accepted'
  const reason = str(a.reason).slice(0, 4000)
  const reasonFromGuess = Boolean(a.reasonFromGuess)
  try {
    const docPath = accepted
      ? await writeDecisionRecord(
          project.path,
          project.decisionsDir,
          candidate.data,
          { reason, reasonFromGuess },
          lang,
        )
      : null
    await events.append(
      trellisEvent(
        project.id,
        'decision.resolved',
        {
          candidateId: candidate.data.candidateId,
          resolution: accepted ? 'accepted' : 'dismissed',
          reason,
          reasonFromGuess,
          docPath,
        },
        candidate,
      ),
    )
    return { ok: true, docPath }
  } catch (error) {
    return { ok: false, docPath: null, message: (error as Error).message }
  }
}
