import { spawn } from 'node:child_process'
import os from 'node:os'
import { track } from '../../platform/children'
import { getEnv } from '../../platform/env'
import { needsCmdWrapper } from '../../platform/which'

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
  const [file, argv] = needsCmdWrapper(executable)
    ? [getEnv(env, 'ComSpec') ?? 'cmd.exe', ['/d', '/c', executable, ...args]]
    : [executable, args]
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const child = track(spawn(file, argv, { cwd: os.tmpdir(), env, windowsHide: true }))
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
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
    child.stdin.end(input)
  })
}
