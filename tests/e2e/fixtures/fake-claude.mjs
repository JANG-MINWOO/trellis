#!/usr/bin/env node
// Stands in for the Claude Code CLI in tests: reads the --settings file Trellis generated and
// posts hook payloads to the bridge exactly like the real CLI (HTTP hooks, header env vars).
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import readline from 'node:readline'

const args = process.argv.slice(2)

// Headless analysis (`-p`): answer with a canned structured result, like `--output-format json`.
// Exits early so the interactive part below never runs.
if (args.includes('-p')) {
  const isolated = ['--restricted', '--strict-mcp-config', '--no-session-persistence'].every((f) =>
    args.includes(f),
  )
  let input = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (c) => (input += c))
  process.stdin.on('end', () => {
    const touched = input.includes('notes.md')
    // Sections look like "## Title\nbody"; an empty one reads "(none)".
    const section = (title) => (input.split(`## ${title}\n`)[1] ?? '').split('\n## ')[0].trim()
    const request = section('Request in this turn')
    const intent = section('Human intent for this work')
    const hasIntent = intent !== '' && intent !== '(none)'
    const output = {
      decisions:
        isolated && touched
          ? [
              {
                title: 'Keep notes in a plain markdown file',
                what: 'Every prompt is appended to notes.md.',
                whyGuess: 'Simple to read without tools',
                alternatives: 'A database table',
                consequences: 'Anyone can read the notes in any editor, but there is no search.',
                kind: 'data',
                risk: 'medium',
                files: ['notes.md', 'not-changed.md'],
              },
            ]
          : [],
      behaviors: touched
        ? [
            {
              op: 'add',
              kind: 'behavior',
              area: 'Notes',
              targetId: '',
              statement: 'WHEN a prompt is sent, THE SYSTEM SHALL append it to notes.md.',
              files: ['notes.md'],
            },
          ]
        : [],
      // "OTHER" in the request reads as different work; "BREAK" as breaking a must-not line.
      intentFit: !hasIntent ? 'unclear' : request.includes('OTHER') ? 'no' : 'yes',
      mustNotBroken:
        hasIntent && request.includes('BREAK') && intent.includes('Must not:')
          ? [{ rule: intent.split('Must not:\n')[1].split('\n')[0], why: 'The turn touched it.' }]
          : [],
    }
    process.stdout.write(
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: '',
        structured_output: output,
      }),
    )
    process.exit(0)
  })
} else {
  interactive()
}

function interactive() {
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
  const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null)
  let sessionId = flag('--session-id') ?? flag('--resume') ?? 'fake-session'
  // Like the real CLI: one <session id>.jsonl per conversation under <config>/projects/<cwd>, and
  // --resume of a conversation it does not have fails at once.
  const config = process.env.CLAUDE_CONFIG_DIR
  const transcript = config
    ? path.join(
        config,
        'projects',
        process.cwd().replace(/[^a-zA-Z0-9]/g, '-'),
        `${sessionId}.jsonl`,
      )
    : null
  if (flag('--resume') && transcript && !fs.existsSync(transcript)) {
    process.stdout.write(`No conversation found with session ID: ${sessionId}\r\n`)
    process.exit(1)
  }

  /** Posts a hook payload; resolves with the parsed response body (null when empty). */
  function post(body) {
    return new Promise((resolve) => {
      const req = http.request(
        hook.url,
        { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' } },
        (res) => {
          let text = ''
          res.setEncoding('utf8')
          res.on('data', (c) => (text += c))
          res.on('end', () => {
            try {
              resolve(text ? JSON.parse(text) : null)
            } catch {
              resolve(null)
            }
          })
        },
      )
      req.on('error', () => resolve(null))
      req.end(JSON.stringify({ session_id: sessionId, cwd: process.cwd(), ...body }))
    })
  }

  // Real Claude Code does not send SessionStart over HTTP hooks; neither do we.
  const flags = args.map((a, i) => (args[i - 1] === '--settings' ? '<settings>' : a)).join(' ')
  process.stdout.write(`\x1b[1;32mFake Claude\x1b[0m ready (${sessionId}). args: ${flags}\r\n> `)

  const rl = readline.createInterface({ input: process.stdin })
  rl.on('line', async (raw) => {
    // Bracketed-paste markers arrive when text comes from Trellis' input box.
    const line = raw.replaceAll('\x1b[200~', '').replaceAll('\x1b[201~', '')
    if (!line) return
    // Like /resume in the real CLI: the conversation ends (SessionEnd "resume") and the same
    // process goes on in another one, which hooks only show from its next prompt on.
    const resume = /^\/resume (\S+)$/.exec(line)
    if (resume) {
      await post({ hook_event_name: 'SessionEnd', reason: 'resume' })
      sessionId = resume[1]
      process.stdout.write(`\r\nResumed ${sessionId}\r\n> `)
      return
    }
    const promptId = randomUUID()
    if (transcript) {
      fs.mkdirSync(path.dirname(transcript), { recursive: true })
      fs.appendFileSync(transcript, `${JSON.stringify({ type: 'user', prompt: line })}\n`)
    }
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
    // A prompt containing "BIGFILE" also writes an over-long code file, which a guard may send back.
    const big = path.join(process.cwd(), 'src', 'feature', 'big.ts')
    if (line.includes('BIGFILE')) fs.writeFileSync(big, 'export const x = 1\n'.repeat(900))
    const stop = await post({
      hook_event_name: 'Stop',
      prompt_id: promptId,
      stop_hook_active: false,
      last_assistant_message: `I created src/feature/fake-output.txt for: ${line}`,
    })
    // Like Claude: a "block" answer means keep working on the reason, then stop again.
    if (stop?.decision === 'block') {
      process.stdout.write(`\r\nBlocked: ${String(stop.reason).split('\n')[0]}\r\n`)
      fs.writeFileSync(big, 'export const x = 1\n'.repeat(10))
      await post({
        hook_event_name: 'Stop',
        prompt_id: promptId,
        stop_hook_active: true,
        last_assistant_message: 'Fixed the problems the check reported.',
      })
    }
    process.stdout.write(`\r\nDone: ${line}\r\n> `)
  })
  rl.on('close', () => process.exit(0))
}
