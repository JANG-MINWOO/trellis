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

/** Runs a command line the user typed (e.g. a project's check command) through their shell. */
export function shellCommand(
  command: string,
  env: NodeJS.ProcessEnv,
): { file: string; args: string[]; verbatim: boolean } {
  if (isWindows()) {
    // cmd /s /c "<line>" keeps the user's own quoting intact.
    return {
      file: getEnv(env, 'ComSpec') ?? 'cmd.exe',
      args: ['/d', '/s', '/c', `"${command}"`],
      verbatim: true,
    }
  }
  return { file: getEnv(env, 'SHELL') || '/bin/sh', args: ['-c', command], verbatim: false }
}
