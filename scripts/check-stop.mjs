// Claude Code Stop hook for this repository (AGENTS.md §10): if source files changed, run the full
// check and block the turn from ending until it passes. Runs the same on macOS and Windows.
import { spawnSync } from 'node:child_process'

const input = await new Promise((resolve) => {
  let data = ''
  if (process.stdin.isTTY) return resolve('')
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (c) => (data += c))
  process.stdin.on('end', () => resolve(data))
  process.stdin.on('error', () => resolve(data))
  setTimeout(() => resolve(data), 2000)
})

function parse(text) {
  try {
    return JSON.parse(text || '{}')
  } catch {
    return {}
  }
}
const payload = parse(input)
// Already continuing because of this hook once: let the turn end to avoid an endless loop.
if (payload.stop_hook_active) process.exit(0)

const status = spawnSync(
  'git',
  [
    'status',
    '--porcelain',
    '--',
    'src',
    'scripts',
    'tests',
    'package.json',
    'electron.vite.config.ts',
    '.dependency-cruiser.cjs',
  ],
  {
    encoding: 'utf8',
  },
)
if (status.status !== 0 || !status.stdout.trim()) process.exit(0)

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const check = spawnSync(npm, ['run', '-s', 'check'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
})
if (check.status === 0) process.exit(0)

const output = `${check.stdout ?? ''}\n${check.stderr ?? ''}`
  .trim()
  .split('\n')
  .slice(-60)
  .join('\n')
process.stderr.write(
  `npm run check failed. Fix these before finishing (AGENTS.md §10). If a failure cannot be fixed, explain why to the user instead of ignoring it.\n\n${output}\n`,
)
process.exit(2)
