// Environment helpers. Windows env keys are case-insensitive ("Path" vs "PATH").
import { isWindows } from './os'

export function getEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  if (!isWindows()) return env[name]
  const key = Object.keys(env).find((k) => k.toUpperCase() === name.toUpperCase())
  return key ? env[key] : undefined
}

export function setEnv(env: NodeJS.ProcessEnv, name: string, value: string): void {
  if (isWindows()) {
    for (const key of Object.keys(env))
      if (key.toUpperCase() === name.toUpperCase()) delete env[key]
  }
  env[name] = value
}

/**
 * Variables that would make a child believe it runs inside another terminal or tool. They leak in
 * when the dev build is started from a terminal. Agent-specific markers are scrubbed by adapters.
 */
const NESTING_MARKERS = [
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ATTACH_CONSOLE',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'TERM_SESSION_ID',
  'ITERM_SESSION_ID',
  'VSCODE_INJECTION',
  'VSCODE_GIT_IPC_HANDLE',
  'VSCODE_GIT_ASKPASS_NODE',
  'VSCODE_GIT_ASKPASS_MAIN',
  'VSCODE_GIT_ASKPASS_EXTRA_ARGS',
  'GIT_ASKPASS',
  'TRELLIS_BRIDGE_TOKEN',
  'TRELLIS_PROJECT_ID',
  'TRELLIS_TERMINAL_ID',
]

export function sanitizeChildEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {}
  const blocked = new Set(NESTING_MARKERS.map((k) => k.toUpperCase()))
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue
    if (blocked.has(key.toUpperCase())) continue
    out[key] = value
  }
  return out
}

/** Finder-launched apps often lack a UTF-8 locale; Korean text in the terminal breaks without one. */
export function ensureUtf8Locale(env: NodeJS.ProcessEnv): void {
  if (!isWindows() && !getEnv(env, 'LANG') && !getEnv(env, 'LC_ALL'))
    setEnv(env, 'LANG', 'en_US.UTF-8')
}
