#!/usr/bin/env node
// Stands in for the Claude Code CLI in tests: reads the --settings file Trellis generated and
// posts hook payloads to the bridge exactly like the real CLI (HTTP hooks, header env vars).
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import readline from 'node:readline'

const args = process.argv.slice(2)
const settings = JSON.parse(fs.readFileSync(args[args.indexOf('--settings') + 1], 'utf8'))
const hook = settings.hooks.UserPromptSubmit[0].hooks[0]
const headers = Object.fromEntries(
  Object.entries(hook.headers).map(([k, v]) => [
    k,
    v.replace(/\$\{(\w+)\}/g, (_, name) =>
      hook.allowedEnvVars.includes(name) ? (process.env[name] ?? '') : '',
    ),
  ]),
)
const sessionId = args.includes('--session-id')
  ? args[args.indexOf('--session-id') + 1]
  : 'fake-session'

function post(body) {
  return new Promise((resolve) => {
    const req = http.request(
      hook.url,
      { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' } },
      (res) => {
        res.resume()
        res.on('end', resolve)
      },
    )
    req.on('error', resolve)
    req.end(JSON.stringify({ session_id: sessionId, cwd: process.cwd(), ...body }))
  })
}

// Real Claude Code does not send SessionStart over HTTP hooks; neither do we.
const flags = args.map((a, i) => (args[i - 1] === '--settings' ? '<settings>' : a)).join(' ')
process.stdout.write(`\x1b[1;32mFake Claude\x1b[0m ready. args: ${flags}\r\n> `)

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', async (raw) => {
  // Bracketed-paste markers arrive when text comes from Trellis' input box.
  const line = raw.replaceAll('\x1b[200~', '').replaceAll('\x1b[201~', '')
  if (!line) return
  const promptId = randomUUID()
  await post({ hook_event_name: 'UserPromptSubmit', prompt: line, prompt_id: promptId })
  const file = path.join(process.cwd(), 'src', 'feature', 'fake-output.txt')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `prompt: ${line}\nline two\n`)
  await post({
    hook_event_name: 'PostToolUse',
    prompt_id: promptId,
    tool_name: 'Write',
    tool_input: { file_path: file, content: '…' },
    tool_response: { type: 'create' },
    duration_ms: 5,
  })
  // Like Claude appending with `cat >>`: the hook only sees a Bash command, git sees the file.
  fs.appendFileSync(path.join(process.cwd(), 'notes.md'), `- ${line}\n`)
  await post({
    hook_event_name: 'PostToolUse',
    prompt_id: promptId,
    tool_name: 'Bash',
    tool_input: { command: 'cat >> notes.md', description: 'Append a note' },
    duration_ms: 1200,
  })
  await post({
    hook_event_name: 'Stop',
    prompt_id: promptId,
    last_assistant_message: `I created src/feature/fake-output.txt for: ${line}`,
  })
  process.stdout.write(`\r\nDone: ${line}\r\n> `)
})
rl.on('close', () => process.exit(0))
