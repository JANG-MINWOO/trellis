import { spawn } from 'node:child_process'
import { killTree, ownProcessGroup } from '../../platform/process'
import { shellCommand } from '../../platform/shells'

const MAX_OUTPUT = 6000
// eslint-disable-next-line no-control-regex -- strips terminal colors from tool output
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g

/** Runs the project's own check command (tests, linters, dependency-cruiser…) in the project. */
export function runCheckCommand(
  command: string,
  cwd: string,
  env: Record<string, string>,
  timeoutMs = 100_000,
): Promise<{ ok: boolean; output: string }> {
  const { file, args, verbatim } = shellCommand(command, env)
  return new Promise((resolve) => {
    let output = ''
    let timedOut = false
    const child = spawn(file, args, {
      cwd,
      env: { ...env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' },
      windowsHide: true,
      windowsVerbatimArguments: verbatim,
      detached: ownProcessGroup(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const keep = (chunk: Buffer): void => {
      output = (output + chunk.toString('utf8')).slice(-MAX_OUTPUT * 2)
    }
    child.stdout?.on('data', keep)
    child.stderr?.on('data', keep)
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child)
    }, timeoutMs)
    const done = (ok: boolean, extra = ''): void => {
      clearTimeout(timer)
      resolve({ ok, output: (output.replace(ANSI, '') + extra).trim().slice(-MAX_OUTPUT) })
    }
    child.on('error', (e) => done(false, `\n${e.message}`))
    child.on('close', (code) =>
      done(code === 0 && !timedOut, timedOut ? `\n(timed out after ${timeoutMs / 1000}s)` : ''),
    )
  })
}
