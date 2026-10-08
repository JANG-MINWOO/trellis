import path from 'node:path'
import { getEnv } from './env'
import { isMac, isWindows } from './os'
import { findExecutable } from './which'

export interface ShellLaunch {
  file: string
  args: string[]
  name: string
}

export function defaultShell(env: NodeJS.ProcessEnv): ShellLaunch {
  if (isWindows()) {
    const pwsh = findExecutable('pwsh', env)
    if (pwsh) return { file: pwsh, args: ['-NoLogo'], name: 'pwsh' }
    const systemRoot = getEnv(env, 'SystemRoot') ?? 'C:\\Windows'
    const powershell = path.join(
      systemRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    )
    return { file: powershell, args: ['-NoLogo'], name: 'powershell' }
  }
  const shell = getEnv(env, 'SHELL') || (isMac() ? '/bin/zsh' : '/bin/bash')
  return { file: shell, args: ['-l'], name: path.basename(shell) }
}
