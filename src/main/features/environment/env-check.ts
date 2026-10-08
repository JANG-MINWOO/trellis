import type { EnvironmentStatus, Settings, ToolStatus } from '@shared/types'
import { execFileText } from '../../lib/exec'
import { currentPlatform } from '../../platform/os'
import { findExecutable, needsCmdWrapper } from '../../platform/which'

async function probe(file: string | null, env: NodeJS.ProcessEnv): Promise<ToolStatus> {
  if (!file) return { found: false, path: null, version: null }
  try {
    const [cmd, args] = needsCmdWrapper(file)
      ? [process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', file, '--version']]
      : [file, ['--version']]
    const { stdout } = await execFileText(cmd, args, { env, timeoutMs: 20_000 })
    return { found: true, path: file, version: stdout.trim().split('\n')[0] ?? null }
  } catch {
    return { found: true, path: file, version: null }
  }
}

export async function checkEnvironment(
  settings: Settings,
  env: NodeJS.ProcessEnv,
  shellEnvResolved: boolean,
): Promise<EnvironmentStatus> {
  const claudePath = settings.claude.path.trim() || findExecutable('claude', env)
  const gitPath = findExecutable('git', env)
  const [claude, git] = await Promise.all([probe(claudePath, env), probe(gitPath, env)])
  return { platform: currentPlatform(), claude, git, shellEnvResolved }
}
