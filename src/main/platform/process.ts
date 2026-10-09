import { execFile, type ChildProcess } from 'node:child_process'
import { isWindows } from './os'

/** Stops a process and everything it started (a check command runs npm, which runs tools). */
export function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return
  if (isWindows()) {
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => undefined)
    return
  }
  try {
    // Spawned with detached: true, so the child leads its own process group.
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

/** Spawn option that makes killTree able to reach the whole tree on POSIX. */
export const ownProcessGroup = (): boolean => !isWindows()
