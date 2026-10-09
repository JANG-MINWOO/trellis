import { afterEach, describe, expect, it } from 'vitest'
import { BridgeServer, type BridgeHandler } from './bridge-server'

let server: BridgeServer | null = null
afterEach(async () => {
  await server?.stop()
  server = null
})

async function post(
  s: BridgeServer,
  body: unknown,
  token = s.token,
): Promise<{ status: number; text: string }> {
  const res = await fetch(s.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Trellis-Project': 'p1',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return { status: res.status, text: await res.text() }
}

async function start(handler: BridgeHandler, ackMs = 1500, stopMs = 2000): Promise<BridgeServer> {
  server = new BridgeServer(handler, ackMs, stopMs)
  await server.start()
  return server
}

describe('BridgeServer', () => {
  it('rejects a wrong token', async () => {
    const s = await start(async () => undefined)
    expect((await post(s, {}, 'nope')).status).toBe(401)
  })

  it('answers with an empty body unless the handler returns one', async () => {
    const s = await start(async ({ raw }) =>
      (raw as { hook_event_name: string }).hook_event_name === 'Stop'
        ? { decision: 'block', reason: 'fix it' }
        : undefined,
    )
    expect(await post(s, { hook_event_name: 'PostToolUse' })).toEqual({ status: 200, text: '' })
    expect(JSON.parse((await post(s, { hook_event_name: 'Stop' })).text)).toEqual({
      decision: 'block',
      reason: 'fix it',
    })
  })

  it('does not keep the agent waiting past the timeout', async () => {
    const s = await start(() => new Promise(() => undefined), 50, 100)
    const started = Date.now()
    expect(await post(s, { hook_event_name: 'UserPromptSubmit' })).toEqual({
      status: 200,
      text: '',
    })
    expect(await post(s, { hook_event_name: 'Stop' })).toEqual({ status: 200, text: '' })
    expect(Date.now() - started).toBeLessThan(1000)
  })
})
