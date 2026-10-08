import { EventEmitter } from 'node:events'
import path from 'node:path'
import type { TrellisEvent } from '@shared/types'
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

  list(projectId: string, limit = 2000): Promise<TrellisEvent[]> {
    return this.queue.run(projectId, () =>
      readJsonlTail<TrellisEvent>(this.fileFor(projectId), limit),
    )
  }
}
