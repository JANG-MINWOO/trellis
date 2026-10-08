// macOS/Linux GUI apps started from Finder/Dock do not inherit the login shell's PATH. Without
// this, claude (and every command Claude runs through its Bash tool) would miss user tools.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { isWindows } from './os'

export function parseMarkedEnv(output: string, mark: string): Record<string, string> | null {
  const start = output.indexOf(mark)
  const end = output.lastIndexOf(mark)
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(output.slice(start + mark.length, end)) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : null
  } catch {
    return null
  }
}

const singleQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`

export interface ShellEnvResult {
  env: NodeJS.ProcessEnv
  resolved: boolean
}

export function resolveShellEnv(timeoutMs = 10_000): Promise<ShellEnvResult> {
  if (isWindows() || process.env.TRELLIS_SKIP_SHELL_ENV === '1') {
    return Promise.resolve({ env: { ...process.env }, resolved: isWindows() })
  }
  const shell = process.env.SHELL || '/bin/zsh'
  const mark = `__TRELLIS_ENV_${randomUUID().replace(/-/g, '')}__`
  const js = `process.stdout.write(${JSON.stringify(mark)}+JSON.stringify(process.env)+${JSON.stringify(mark)})`
  const command = `${singleQuote(process.execPath)} -e ${singleQuote(js)}`

  return new Promise((resolve) => {
    let output = ''
    let settled = false
    const child = spawn(shell, ['-ilc', command], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ELECTRON_NO_ATTACH_CONSOLE: '1' },
      stdio: ['ignore', 'pipe', 'ignore'],
      detached: true,
    })
    const finish = (env: Record<string, string> | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (env) {
        delete env.ELECTRON_RUN_AS_NODE
        delete env.ELECTRON_NO_ATTACH_CONSOLE
        resolve({ env: { ...process.env, ...env }, resolved: true })
      } else {
        resolve({ env: { ...process.env }, resolved: false })
      }
    }
    const timer = setTimeout(() => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL')
      } catch {
        // already gone
      }
      finish(null)
    }, timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => (output += chunk))
    child.on('error', () => finish(null))
    child.on('close', () => finish(parseMarkedEnv(output, mark)))
  })
}
