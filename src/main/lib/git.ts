import { spawn } from 'node:child_process'
import { execFileText } from './exec'

export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

export interface GitRunOptions {
  env?: Record<string, string>
  input?: string
  timeoutMs?: number
}

/** Thin argv-only git runner. GIT_OPTIONAL_LOCKS=0 keeps us from taking locks the user needs. */
export class Git {
  constructor(
    readonly executable: string,
    private readonly baseEnv: () => NodeJS.ProcessEnv,
  ) {}

  private env(extra?: Record<string, string>): NodeJS.ProcessEnv {
    return { ...this.baseEnv(), GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', ...extra }
  }

  async run(cwd: string, args: string[], options: GitRunOptions = {}): Promise<string> {
    if (options.input !== undefined) return this.runWithInput(cwd, args, options)
    const { stdout } = await execFileText(this.executable, args, {
      cwd,
      env: this.env(options.env),
      timeoutMs: options.timeoutMs ?? 60_000,
    })
    return stdout
  }

  /** Like run, but returns null instead of throwing on a non-zero exit. */
  async tryRun(cwd: string, args: string[], options: GitRunOptions = {}): Promise<string | null> {
    try {
      return await this.run(cwd, args, options)
    } catch {
      return null
    }
  }

  /** Reads many blobs through one `git cat-file --batch`. Missing objects are left out. */
  readBlobs(
    cwd: string,
    shas: readonly string[],
    timeoutMs = 60_000,
  ): Promise<Map<string, Buffer>> {
    if (shas.length === 0) return Promise.resolve(new Map())
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, ['cat-file', '--batch'], {
        cwd,
        env: this.env(),
        windowsHide: true,
      })
      const chunks: Buffer[] = []
      const timer = setTimeout(() => child.kill(), timeoutMs)
      child.stdout.on('data', (c: Buffer) => chunks.push(c))
      child.stderr.resume()
      child.on('error', (e) => {
        clearTimeout(timer)
        reject(e)
      })
      child.on('close', () => {
        clearTimeout(timer)
        resolve(parseBatch(Buffer.concat(chunks)))
      })
      child.stdin.on('error', () => undefined)
      child.stdin.end(shas.join('\n') + '\n')
    })
  }

  private runWithInput(cwd: string, args: string[], options: GitRunOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, args, {
        cwd,
        env: this.env(options.env),
        windowsHide: true,
      })
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => child.kill(), options.timeoutMs ?? 60_000)
      child.stdout.setEncoding('utf8').on('data', (c: string) => (stdout += c))
      child.stderr.setEncoding('utf8').on('data', (c: string) => (stderr += c))
      child.on('error', (e) => {
        clearTimeout(timer)
        reject(e)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        // git check-ignore exits 1 when nothing matched; that is not an error for us.
        if (code === 0 || code === 1) resolve(stdout)
        else reject(new Error(stderr.trim() || `git exited with ${code}`))
      })
      child.stdin.on('error', () => undefined)
      child.stdin.end(options.input)
    })
  }
}

/** Parses `git cat-file --batch` output: "<sha> <type> <size>\n<content>\n" or "<sha> missing\n". */
export function parseBatch(out: Buffer): Map<string, Buffer> {
  const blobs = new Map<string, Buffer>()
  let pos = 0
  while (pos < out.length) {
    const nl = out.indexOf(10, pos)
    if (nl < 0) break
    const [sha, type, size] = out.subarray(pos, nl).toString('utf8').split(' ')
    pos = nl + 1
    if (!sha || type === 'missing' || size === undefined) continue
    const length = Number(size)
    if (type === 'blob') blobs.set(sha, out.subarray(pos, pos + length))
    pos += length + 1
  }
  return blobs
}
