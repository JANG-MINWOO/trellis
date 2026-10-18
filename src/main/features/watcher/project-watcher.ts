import { EventEmitter } from 'node:events'
import { type FSWatcher, watch } from 'node:fs'

const DEBOUNCE_MS = 600
// Ignore dependency folders. Inside .git only what moves HEAD or the index matters: commits,
// checkouts, staging, and branch moves that leave the index alone (`git reset --soft`).
const IGNORED = /(^|[\\/])node_modules([\\/]|$)/
const GIT_DIR = /(^|[\\/])\.git([\\/]|$)/
const GIT_INTERESTING = /(^|[\\/])\.git[\\/](HEAD|index|packed-refs|refs[\\/]heads[\\/].+)$/

/** Whether a change to `filename` (relative to the project) can change files or HEAD. */
export function isRelevantChange(filename: string): boolean {
  if (IGNORED.test(filename)) return false
  return !GIT_DIR.test(filename) || GIT_INTERESTING.test(filename)
}

/** Watches the active project recursively and reports "something changed" (debounced). */
export class ProjectWatcher extends EventEmitter<{ changed: [string] }> {
  private watcher: FSWatcher | null = null
  private projectId: string | null = null
  private timer: NodeJS.Timeout | null = null

  watch(projectId: string | null, root: string | null): void {
    if (projectId === this.projectId && this.watcher) return
    this.stop()
    if (!projectId || !root) return
    this.projectId = projectId
    try {
      this.watcher = watch(root, { recursive: true }, (_event, filename) =>
        this.onChange(filename?.toString() ?? ''),
      )
      this.watcher.on('error', () => this.stop())
    } catch {
      this.watcher = null
    }
  }

  private onChange(filename: string): void {
    if (!isRelevantChange(filename)) return
    if (this.timer) clearTimeout(this.timer)
    const id = this.projectId
    this.timer = setTimeout(() => {
      if (id) this.emit('changed', id)
    }, DEBOUNCE_MS)
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
    this.projectId = null
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
