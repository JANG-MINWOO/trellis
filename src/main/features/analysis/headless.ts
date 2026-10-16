import { spawn } from 'node:child_process'
import os from 'node:os'
import { track } from '../../platform/children'
import { killTree } from '../../platform/process'
import { spawnTarget } from '../../platform/which'

export interface HeadlessResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

/** Runs the agent once with the prompt on stdin, from a neutral folder (no project files). */
export function runHeadless(
  executable: string,
  args: string[],
  env: Record<string, string>,
  input: string,
  timeoutMs: number,
): Promise<HeadlessResult> {
  const { file, args: argv } = spawnTarget(executable, args, env)
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const child = track(spawn(file, argv, { cwd: os.tmpdir(), env, windowsHide: true }))
    const timer = setTimeout(() => {
      timedOut = true
      // The whole tree: on Windows the agent may run under a cmd.exe wrapper.
      killTree(child)
    }, timeoutMs)
    child.stdout.setEncoding('utf8').on('data', (c: string) => (stdout += c))
    child.stderr.setEncoding('utf8').on('data', (c: string) => (stderr += c))
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: null, stdout, stderr: stderr + e.message, timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
    // An agent that exits before reading its prompt (e.g. not logged in) must not crash main;
    // the exit code and stderr already tell what happened.
    child.stdin.on('error', () => undefined)
    child.stdin.end(input)
  })
}
