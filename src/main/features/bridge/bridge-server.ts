// Local HTTP endpoint that receives agent hook payloads (ADR-0003). Bound to 127.0.0.1 and
// guarded by a random token; replies 200 with an empty body, which Claude Code treats as a no-op.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { EventEmitter } from 'node:events'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

const MAX_BODY = 8 * 1024 * 1024

export interface BridgePayload {
  raw: unknown
  projectId: string
  terminalId: string | null
  receivedAt: number
}

export class BridgeServer extends EventEmitter<{ payload: [BridgePayload] }> {
  readonly token = randomBytes(24).toString('hex')
  private server: http.Server | null = null
  private port = 0

  get url(): string {
    return `http://127.0.0.1:${this.port}/events`
  }

  get listening(): boolean {
    return this.server?.listening ?? false
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
    const reply = (status: number): void => {
      res.writeHead(status, { 'Content-Length': '0' })
      res.end()
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
      reply(200)
      const projectId = String(req.headers['x-trellis-project'] ?? '')
      if (!projectId) return
      let raw: unknown
      try {
        raw = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        return
      }
      const terminalId = String(req.headers['x-trellis-terminal'] ?? '') || null
      this.emit('payload', { raw, projectId, terminalId, receivedAt: Date.now() })
    })
  }
}
