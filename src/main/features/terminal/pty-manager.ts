import { EventEmitter } from 'node:events'
import * as pty from 'node-pty'
import type { TerminalDataMessage } from '@shared/ipc'
import type { TerminalInfo } from '@shared/types'

const MAX_BUFFER_CHARS = 512 * 1024
const FLUSH_MS = 6

export interface SpawnPlan {
  file: string
  args: string[]
  cwd: string
  env: Record<string, string>
}

interface Session {
  info: TerminalInfo
  proc: pty.IPty | null
  chunks: string[]
  size: number
  pending: string
  flushTimer: NodeJS.Timeout | null
  cols: number
  rows: number
  /** Incremented per process so a late exit from a replaced process is ignored. */
  generation: number
}

/** Owns pty processes. Output is batched for IPC and kept in a ring buffer for re-attach. */
export class PtyManager extends EventEmitter<{
  data: [TerminalDataMessage]
  update: [TerminalInfo]
  exit: [TerminalInfo, string]
  removed: [string]
}> {
  private sessions = new Map<string, Session>()

  create(
    info: Omit<TerminalInfo, 'running' | 'exitCode' | 'startedAt'>,
    plan: SpawnPlan,
    cols: number,
    rows: number,
  ): TerminalInfo {
    const session: Session = {
      info: { ...info, running: false, exitCode: null, startedAt: Date.now() },
      proc: null,
      chunks: [],
      size: 0,
      pending: '',
      flushTimer: null,
      cols,
      rows,
      generation: 0,
    }
    this.sessions.set(info.id, session)
    this.launch(session, plan)
    return { ...session.info }
  }

  /** Starts a new process in an existing terminal (same id, same scrollback). */
  restart(id: string, plan: SpawnPlan, patch: Partial<TerminalInfo> = {}): TerminalInfo | null {
    const session = this.sessions.get(id)
    if (!session) return null
    if (session.proc && session.info.running) {
      session.generation += 1
      try {
        session.proc.kill()
      } catch {
        // already exited
      }
    }
    Object.assign(session.info, patch)
    session.info.startedAt = Date.now()
    this.launch(session, plan)
    return { ...session.info }
  }

  private launch(session: Session, plan: SpawnPlan): void {
    const generation = ++session.generation
    let proc: pty.IPty
    try {
      proc = pty.spawn(plan.file, plan.args, {
        name: 'xterm-256color',
        cols: session.cols,
        rows: session.rows,
        cwd: plan.cwd,
        env: plan.env,
      })
    } catch (error) {
      session.proc = null
      session.info.running = false
      session.info.exitCode = -1
      this.push(session, `\r\n\x1b[31m${(error as Error).message}\x1b[0m\r\n`)
      this.emit('update', { ...session.info })
      throw error
    }
    session.proc = proc
    session.info.running = true
    session.info.exitCode = null
    proc.onData((data) => {
      if (generation === session.generation) this.push(session, data)
    })
    proc.onExit(({ exitCode }) => {
      if (generation !== session.generation) return
      this.flush(session)
      session.proc = null
      session.info.running = false
      session.info.exitCode = exitCode
      const info = { ...session.info }
      this.emit('update', info)
      this.emit('exit', info, this.recentOutput(session, 4000))
    })
    this.emit('update', { ...session.info })
  }

  private push(session: Session, data: string): void {
    session.pending += data
    session.chunks.push(data)
    session.size += data.length
    while (session.size > MAX_BUFFER_CHARS && session.chunks.length > 1) {
      session.size -= session.chunks.shift()!.length
    }
    if (!session.flushTimer) session.flushTimer = setTimeout(() => this.flush(session), FLUSH_MS)
  }

  private flush(session: Session): void {
    if (session.flushTimer) clearTimeout(session.flushTimer)
    session.flushTimer = null
    if (!session.pending) return
    const data = session.pending
    session.pending = ''
    this.emit('data', { terminalId: session.info.id, data })
  }

  private recentOutput(session: Session, chars: number): string {
    return session.chunks.join('').slice(-chars)
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.proc?.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (!session || cols < 2 || rows < 2) return
    session.cols = cols
    session.rows = rows
    try {
      session.proc?.resize(cols, rows)
    } catch {
      // resizing an exiting pty can throw; harmless
    }
  }

  update(id: string, patch: Partial<TerminalInfo>): void {
    const session = this.sessions.get(id)
    if (!session) return
    Object.assign(session.info, patch)
    this.emit('update', { ...session.info })
  }

  /** Ends the process but keeps the terminal, so its tab can show how to restart. */
  kill(id: string): void {
    try {
      this.sessions.get(id)?.proc?.kill()
    } catch {
      // already exited
    }
  }

  /** Kills the process, forgets the terminal and tells listeners it is gone. */
  dispose(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    session.generation += 1
    try {
      session.proc?.kill()
    } catch {
      // already exited
    }
    if (session.flushTimer) clearTimeout(session.flushTimer)
    this.sessions.delete(id)
    this.emit('removed', id)
  }

  get(id: string): TerminalInfo | null {
    const session = this.sessions.get(id)
    return session ? { ...session.info } : null
  }

  list(): TerminalInfo[] {
    return [...this.sessions.values()].map((s) => ({ ...s.info }))
  }

  attach(id: string): string {
    const session = this.sessions.get(id)
    if (!session) return ''
    this.flush(session)
    return session.chunks.join('')
  }

  runningCount(kind?: TerminalInfo['kind']): number {
    return [...this.sessions.values()].filter(
      (s) => s.info.running && (!kind || s.info.kind === kind),
    ).length
  }

  disposeAll(): void {
    for (const id of [...this.sessions.keys()]) this.dispose(id)
  }
}
