import { invariantStatements } from '@shared/intent'
import type { BehaviorResolution, Language, Project } from '@shared/types'
import { newId } from '../../lib/ids'
import { trellisEvent, type EventStore } from '../events'
import { applyBehavior } from './spec-store'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** The human's answer to a behavior change: accepted ones update the spec line by line. */
export async function resolveBehavior(
  events: EventStore,
  project: Project,
  lang: Language,
  candidateId: string,
  answer: unknown,
): Promise<{ ok: boolean; specPath: string | null; message?: string }> {
  const a = (answer && typeof answer === 'object' ? answer : {}) as Partial<BehaviorResolution>
  const candidate = await events.openCandidate(project.id, 'behavior.candidate', candidateId)
  if (!candidate) return { ok: false, specPath: null, message: 'not-found' }
  const accepted = a.resolution === 'accepted'
  // The human may have reworded the statement or moved it to another area.
  const statement = str(a.statement).trim() || candidate.data.statement
  const area = str(a.area).trim() || candidate.data.area
  try {
    const written = accepted
      ? await applyBehavior(
          project.path,
          project.specsDir,
          {
            op: candidate.data.op,
            kind: candidate.data.kind,
            targetId: candidate.data.targetId,
            area,
            statement,
          },
          lang,
        )
      : null
    await events.append(
      trellisEvent(
        project.id,
        'behavior.resolved',
        {
          candidateId: candidate.data.candidateId,
          resolution: accepted ? 'accepted' : 'dismissed',
          statement,
          area,
          specPath: written?.specPath ?? null,
          itemId: written?.itemId ?? null,
        },
        candidate,
      ),
    )
    return { ok: true, specPath: written?.specPath ?? null }
  } catch (error) {
    return { ok: false, specPath: null, message: (error as Error).message }
  }
}

/** "Must not" lines of an intent become invariant candidates the human can accept. */
export async function invariantsFromIntent(
  events: EventStore,
  project: Project,
  lines: unknown,
  area: unknown,
): Promise<void> {
  for (const statement of invariantStatements(lines)) {
    await events.append(
      trellisEvent(project.id, 'behavior.candidate', {
        candidateId: newId(),
        source: 'intent',
        op: 'add',
        kind: 'invariant',
        area: str(area).trim() || project.name,
        targetId: null,
        statement,
        files: [],
      }),
    )
  }
}
