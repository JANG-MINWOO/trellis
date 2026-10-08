import { accessSync, constants, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getEnv } from './env'
import { isMac, isWindows } from './os'

/** Folders where CLI installers commonly put binaries, checked after PATH. */
function wellKnownDirs(): string[] {
  const home = os.homedir()
  if (isWindows()) {
    const local = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local')
    const roaming = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming')
    return [
      path.join(home, '.local', 'bin'),
      path.join(roaming, 'npm'),
      path.join(local, 'Programs', 'Git', 'cmd'),
    ]
  }
  const dirs = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.claude', 'local'),
    '/usr/local/bin',
    '/usr/bin',
  ]
  if (isMac()) dirs.splice(2, 0, '/opt/homebrew/bin')
  return dirs
}

function isExecutableFile(file: string): boolean {
  try {
    if (!statSync(file).isFile()) return false
    if (!isWindows()) accessSync(file, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Finds an executable like a shell would (PATH + PATHEXT), then in well-known install folders. */
export function findExecutable(name: string, env: NodeJS.ProcessEnv): string | null {
  const pathDirs = (getEnv(env, 'PATH') ?? '').split(path.delimiter).filter(Boolean)
  const exts = isWindows()
    ? [
        '',
        ...(getEnv(env, 'PATHEXT') ?? '.COM;.EXE;.BAT;.CMD')
          .split(';')
          .filter(Boolean)
          .map((e) => e.toLowerCase()),
      ]
    : ['']
  for (const dir of [...pathDirs, ...wellKnownDirs()]) {
    for (const ext of exts) {
      // On Windows an extensionless file is never directly executable; skip it.
      if (isWindows() && ext === '') continue
      const candidate = path.join(dir, name + ext)
      if (isExecutableFile(candidate)) return candidate
    }
  }
  return null
}

/** Windows batch files cannot be spawned directly; they need cmd.exe. */
export function needsCmdWrapper(file: string): boolean {
  return isWindows() && /\.(cmd|bat)$/i.test(file)
}
