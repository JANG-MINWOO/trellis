// Local HTTP endpoint that receives agent hook payloads (ADR-0003). Bound to 127.0.0.1 and
// guarded by a random token; replies 200 with an empty body, which Claude Code treats as a no-op,
// or with the handler's JSON (a Stop "block" from the guard, ADR-0027).
// The reply waits (briefly) for the handler, so work done for a prompt hook — like the turn's git
// snapshot — happens before Claude starts acting on the prompt.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { logFailure } from '../../lib/log'

const MAX_BODY = 8 * 1024 * 1024

export interface BridgePayload {
  raw: unknown
  projectId: string
  terminalId: string | null
  receivedAt: number
}

/** May return a JSON body for the hook response (e.g. {decision: "block"} for Stop). */
export type BridgeHandler = (
  payload: BridgePayload,
) => Promise<Record<string, unknown> | undefined | void>

export class BridgeServer {
  readonly token = randomBytes(24).toString('hex')
  private server: http.Server | null = null
  private port = 0

  constructor(
    private readonly handler: BridgeHandler,
    /** Longest a hook waits for the handler; Claude never blocks longer than this on Trellis. */
    private readonly ackTimeoutMs = 1500,
    /** Stop may run the project's checks before answering (guard); its hook timeout is longer. */
    private readonly stopTimeoutMs = 115_000,
  ) {}

  get url(): string {
    return `http://127.0.0.1:${this.port}/events`
  }

  start(): Promise<void> {
    this.server = http.createServer((req, res) => this.handle(req, res))
    return new Promise((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '127.0.0.1', () => {
        this.port = (this.server!.address() as AddressInfo).port
        resolve()
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()))
  }

  private authorized(header: string | undefined): boolean {
    const expected = Buffer.from(`Bearer ${this.token}`)
    const actual = Buffer.from(header ?? '')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const reply = (status: number, body?: Record<string, unknown>): void => {
      if (res.headersSent) return
      const json = body ? Buffer.from(JSON.stringify(body)) : null
      res.writeHead(
        status,
        json
          ? { 'Content-Type': 'application/json', 'Content-Length': String(json.length) }
          : { 'Content-Length': '0' },
      )
      res.end(json ?? undefined)
    }
    if (req.method !== 'POST' || req.url !== '/events') return reply(404)
    if (!this.authorized(req.headers.authorization)) return reply(401)

    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reply(413)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (size > MAX_BODY) return
      const projectId = String(req.headers['x-trellis-project'] ?? '')
      let raw: unknown
      try {
        raw = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        return reply(200)
      }
      if (!projectId) return reply(200)
      const terminalId = String(req.headers['x-trellis-terminal'] ?? '') || null
      const isStop = (raw as { hook_event_name?: unknown } | null)?.hook_event_name === 'Stop'
      const work = this.handler({ raw, projectId, terminalId, receivedAt: Date.now() }).catch(
        logFailure('bridge', 'handling a hook event failed'),
      )
      let timer: NodeJS.Timeout | undefined
      const timeout = new Promise<undefined>((resolve) => {
        timer = setTimeout(
          () => resolve(undefined),
          isStop ? this.stopTimeoutMs : this.ackTimeoutMs,
        )
      })
      void Promise.race([work, timeout]).then((body) => {
        clearTimeout(timer)
        reply(200, body ?? undefined)
      })
    })
  }
}
