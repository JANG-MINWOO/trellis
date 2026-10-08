import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { EditorKind } from '@shared/types'
import { getEnv } from './env'
import { isMac, isWindows } from './os'
import { findExecutable, needsCmdWrapper } from './which'

export type EditorLaunch = { kind: 'process'; file: string; args: string[] } | { kind: 'system' }

function macApp(appName: string): string | null {
  for (const dir of ['/Applications', path.join(os.homedir(), 'Applications')]) {
    const app = path.join(dir, `${appName}.app`)
    if (existsSync(app)) return app
  }
  return null
}

function windowsExe(candidates: string[]): string | null {
  return candidates.find((c) => existsSync(c)) ?? null
}

function codeLike(
  which: 'vscode' | 'cursor',
  env: NodeJS.ProcessEnv,
  root: string,
  file: string,
): EditorLaunch | null {
  if (isMac()) {
    const app = macApp(which === 'vscode' ? 'Visual Studio Code' : 'Cursor')
    return app ? { kind: 'process', file: '/usr/bin/open', args: ['-a', app, root, file] } : null
  }
  if (isWindows()) {
    const local = getEnv(env, 'LOCALAPPDATA') ?? path.join(os.homedir(), 'AppData', 'Local')
    const programFiles = getEnv(env, 'ProgramFiles') ?? 'C:\\Program Files'
    const exe =
      which === 'vscode'
        ? windowsExe([
            path.join(local, 'Programs', 'Microsoft VS Code', 'Code.exe'),
            path.join(programFiles, 'Microsoft VS Code', 'Code.exe'),
          ])
        : windowsExe([path.join(local, 'Programs', 'cursor', 'Cursor.exe')])
    return exe ? { kind: 'process', file: exe, args: [root, file] } : null
  }
  const bin = findExecutable(which === 'vscode' ? 'code' : 'cursor', env)
  return bin ? { kind: 'process', file: bin, args: [root, file] } : null
}

/** Decides how to open `file` (absolute) from project `root` with the configured editor. */
export function resolveEditorLaunch(
  kind: EditorKind,
  customPath: string,
  env: NodeJS.ProcessEnv,
  root: string,
  file: string,
): EditorLaunch | null {
  switch (kind) {
    case 'system':
      return { kind: 'system' }
    case 'vscode':
    case 'cursor':
      return codeLike(kind, env, root, file)
    case 'custom': {
      if (!customPath) return null
      if (needsCmdWrapper(customPath)) {
        return {
          kind: 'process',
          file: getEnv(env, 'ComSpec') ?? 'cmd.exe',
          args: ['/d', '/s', '/c', customPath, file],
        }
      }
      return { kind: 'process', file: customPath, args: [file] }
    }
    case 'auto':
      return (
        codeLike('vscode', env, root, file) ??
        codeLike('cursor', env, root, file) ?? { kind: 'system' }
      )
  }
}
