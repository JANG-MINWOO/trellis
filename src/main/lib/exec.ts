import { execFile } from 'node:child_process'

export interface ExecOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  maxBuffer?: number
}

export interface ExecResult {
  stdout: string
  stderr: string
}

export class ExecError extends Error {
  constructor(
    message: string,
    readonly code: number | string | null,
    readonly stderr: string,
  ) {
    super(message)
  }
}

/** execFile with argv only (no shell), promise-based. */
export function execFileText(
  file: string,
  args: string[],
  options: ExecOptions = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeoutMs ?? 30_000,
        maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
        windowsHide: true,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        if (error) {
          const code = (error as NodeJS.ErrnoException & { code?: number | string }).code ?? null
          reject(new ExecError(stderr.trim() || error.message, code, stderr))
        } else {
          resolve({ stdout, stderr })
        }
      },
    )
  })
}
