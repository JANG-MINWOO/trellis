import { EventEmitter } from 'node:events'
import path from 'node:path'
import { openCandidate } from '@shared/decisions'
import { EVENT_WINDOW } from '@shared/defaults'
import { isPinnedLine } from '@shared/event-window'
import type { EventOf, TrellisEvent } from '@shared/types'
import { appendJsonl, readJsonlTail } from '../../lib/jsonl'
import { KeyedSerialQueue } from '../../lib/serial'

/** The append-only event ledger, one JSONL file per project. Everything else is computed from it. */
export class EventStore extends EventEmitter<{ event: [TrellisEvent] }> {
  private readonly queue = new KeyedSerialQueue()

  constructor(private readonly projectsDir: string) {
    super()
  }

  private fileFor(projectId: string): string {
    return path.join(this.projectsDir, projectId, 'events.jsonl')
  }

  async append(event: TrellisEvent): Promise<void> {
    await this.queue.run(event.projectId, () => appendJsonl(this.fileFor(event.projectId), event))
    this.emit('event', event)
  }

  /** The last `limit` events, plus older intent events (tasks can outlive the window). */
  list(projectId: string, limit = EVENT_WINDOW): Promise<TrellisEvent[]> {
    return this.queue.run(projectId, () =>
      readJsonlTail<TrellisEvent>(this.fileFor(projectId), limit, isPinnedLine),
    )
  }

  /** A decision or behavior candidate the human has not answered yet (looks far back). */
  async openCandidate<K extends 'decision.candidate' | 'behavior.candidate'>(
    projectId: string,
    kind: K,
    candidateId: string,
  ): Promise<EventOf<K> | null> {
    return openCandidate(await this.list(projectId, 20_000), kind, candidateId)
  }
}
