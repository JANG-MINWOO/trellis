// Finds editors installed on this computer and decides how to open a file with one of them.
import { existsSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { EditorApp, Settings } from '@shared/types'
import { getEnv } from './env'
import { isMac, isWindows } from './os'
import { findExecutable, spawnTarget } from './which'

interface EditorDef {
  id: string
  name: string
  /** macOS app bundle names, without ".app". */
  mac?: string[]
  /** Windows executable candidates. */
  win?: (dirs: WinDirs) => string[]
  /** Linux command on PATH. */
  linux?: string
  /**
   * Pass the project folder too, so the file opens inside the project window. Off for IDEs that
   * would create project files (e.g. JetBrains' .idea) in a folder they open.
   */
  openRoot: boolean
}

interface WinDirs {
  local: string
  programFiles: string
  programFilesX86: string
}

/** Entries of `dir` whose names start with `prefix`, joined with `rest` (JetBrains versioned dirs). */
function versioned(dir: string, prefix: string, ...rest: string[]): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => name.startsWith(prefix))
      .sort()
      .reverse()
      .map((name) => path.join(dir, name, ...rest))
  } catch {
    return []
  }
}

const jetbrains = (product: string, exe: string) => (d: WinDirs) => [
  ...versioned(path.join(d.local, 'Programs'), product, 'bin', exe),
  ...versioned(path.join(d.programFiles, 'JetBrains'), product, 'bin', exe),
]

const CATALOG: EditorDef[] = [
  {
    id: 'vscode',
    name: 'Visual Studio Code',
    mac: ['Visual Studio Code'],
    win: (d) => [
      path.join(d.local, 'Programs', 'Microsoft VS Code', 'Code.exe'),
      path.join(d.programFiles, 'Microsoft VS Code', 'Code.exe'),
    ],
    linux: 'code',
    openRoot: true,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    mac: ['Cursor'],
    win: (d) => [path.join(d.local, 'Programs', 'cursor', 'Cursor.exe')],
    linux: 'cursor',
    openRoot: true,
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    mac: ['Windsurf'],
    win: (d) => [path.join(d.local, 'Programs', 'Windsurf', 'Windsurf.exe')],
    linux: 'windsurf',
    openRoot: true,
  },
  {
    id: 'zed',
    name: 'Zed',
    mac: ['Zed'],
    win: (d) => [path.join(d.local, 'Programs', 'Zed', 'Zed.exe')],
    linux: 'zed',
    openRoot: true,
  },
  {
    id: 'sublime',
    name: 'Sublime Text',
    mac: ['Sublime Text'],
    win: (d) => [path.join(d.programFiles, 'Sublime Text', 'sublime_text.exe')],
    linux: 'subl',
    openRoot: false,
  },
  {
    id: 'idea',
    name: 'IntelliJ IDEA',
    mac: [
      'IntelliJ IDEA',
      'IntelliJ IDEA Ultimate',
      'IntelliJ IDEA CE',
      'IntelliJ IDEA Community Edition',
    ],
    win: jetbrains('IntelliJ IDEA', 'idea64.exe'),
    linux: 'idea',
    openRoot: false,
  },
  {
    id: 'webstorm',
    name: 'WebStorm',
    mac: ['WebStorm'],
    win: jetbrains('WebStorm', 'webstorm64.exe'),
    linux: 'webstorm',
    openRoot: false,
  },
  {
    id: 'pycharm',
    name: 'PyCharm',
    mac: ['PyCharm', 'PyCharm CE', 'PyCharm Community Edition', 'PyCharm Professional Edition'],
    win: jetbrains('PyCharm', 'pycharm64.exe'),
    linux: 'pycharm',
    openRoot: false,
  },
  { id: 'android-studio', name: 'Android Studio', mac: ['Android Studio'], openRoot: false },
  {
    id: 'notepadpp',
    name: 'Notepad++',
    win: (d) => [
      path.join(d.programFiles, 'Notepad++', 'notepad++.exe'),
      path.join(d.programFilesX86, 'Notepad++', 'notepad++.exe'),
    ],
    openRoot: false,
  },
  { id: 'textedit', name: 'TextEdit', mac: ['TextEdit'], openRoot: false },
]

function macAppPath(names: string[]): string | null {
  const dirs = ['/Applications', path.join(os.homedir(), 'Applications'), '/System/Applications']
  for (const name of names) {
    for (const dir of dirs) {
      const app = path.join(dir, `${name}.app`)
      if (existsSync(app)) return app
    }
  }
  return null
}

function winDirs(env: NodeJS.ProcessEnv): WinDirs {
  return {
    local: getEnv(env, 'LOCALAPPDATA') ?? path.join(os.homedir(), 'AppData', 'Local'),
    programFiles: getEnv(env, 'ProgramFiles') ?? 'C:\\Program Files',
    programFilesX86: getEnv(env, 'ProgramFiles(x86)') ?? 'C:\\Program Files (x86)',
  }
}

/** Where the editor lives on this computer, or null. */
function locate(def: EditorDef, env: NodeJS.ProcessEnv): string | null {
  if (isMac()) return def.mac ? macAppPath(def.mac) : null
  if (isWindows())
    return def.win ? (def.win(winDirs(env)).find((p) => existsSync(p)) ?? null) : null
  return def.linux ? findExecutable(def.linux, env) : null
}

export function detectEditors(env: NodeJS.ProcessEnv): EditorApp[] {
  return CATALOG.filter((def) => locate(def, env) !== null).map(({ id, name }) => ({ id, name }))
}

export type EditorLaunch =
  | { kind: 'process'; file: string; args: string[] }
  | { kind: 'system' }
  | { kind: 'reveal' }
  | { kind: 'ask' }
  | { kind: 'missing' }

/** Decides how to open `file` (absolute) from project `root` with the configured editor. */
export function resolveEditorLaunch(
  editor: Settings['editor'],
  env: NodeJS.ProcessEnv,
  root: string,
  file: string,
): EditorLaunch {
  switch (editor.kind) {
    case 'ask':
      return { kind: 'ask' }
    case 'system':
      return { kind: 'system' }
    case 'reveal':
      return { kind: 'reveal' }
    case 'custom': {
      if (!editor.customPath) return { kind: 'missing' }
      return { kind: 'process', ...spawnTarget(editor.customPath, [file], env) }
    }
    case 'app': {
      const def = CATALOG.find((d) => d.id === editor.app)
      const where = def ? locate(def, env) : null
      if (!def || !where) return { kind: 'missing' }
      const targets = def.openRoot ? [root, file] : [file]
      if (isMac())
        return { kind: 'process', file: '/usr/bin/open', args: ['-a', where, ...targets] }
      return { kind: 'process', file: where, args: targets }
    }
  }
}
