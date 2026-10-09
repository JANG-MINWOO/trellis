import type { ChildProcess } from 'node:child_process'
import { killTree } from './process'

/** Background processes Trellis started (analysis, check commands), stopped when the app quits. */
const running = new Set<ChildProcess>()

export function track<T extends ChildProcess>(child: T): T {
  running.add(child)
  child.once('close', () => running.delete(child))
  child.once('error', () => running.delete(child))
  return child
}

export function stopAllChildren(): void {
  for (const child of running) killTree(child)
  running.clear()
}
