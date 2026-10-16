// Settings passed with `claude --settings <file>` (ADR-0003). HTTP hooks need no shell, so they
// behave the same on macOS and Windows, and a failed POST never blocks Claude.

export const BRIDGE_ENV = {
  token: 'TRELLIS_BRIDGE_TOKEN',
  project: 'TRELLIS_PROJECT_ID',
  terminal: 'TRELLIS_TERMINAL_ID',
} as const

// SessionStart is left out on purpose: in interactive mode Claude Code (2.1.294) runs only
// command hooks for it, never HTTP hooks. Trellis records session starts itself at launch.
const HOOK_EVENTS = [
  'SessionEnd',
  'UserPromptSubmit',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
  'Notification',
] as const

/** Seconds Claude waits for each hook. Stop may wait for the project's checks (guard). */
export const STOP_HOOK_TIMEOUT_S = 120
const SESSION_END_TIMEOUT_S = 1
const DEFAULT_TIMEOUT_S = 5

export function buildHookSettings(url: string): Record<string, unknown> {
  const hook = (timeout: number) => ({
    type: 'http',
    url,
    headers: {
      Authorization: `Bearer \${${BRIDGE_ENV.token}}`,
      'X-Trellis-Project': `\${${BRIDGE_ENV.project}}`,
      'X-Trellis-Terminal': `\${${BRIDGE_ENV.terminal}}`,
    },
    allowedEnvVars: Object.values(BRIDGE_ENV),
    timeout,
  })
  const hooks: Record<string, unknown[]> = {}
  for (const event of HOOK_EVENTS) {
    // SessionEnd hooks share a 1.5s budget.
    const timeout =
      event === 'SessionEnd'
        ? SESSION_END_TIMEOUT_S
        : event === 'Stop'
          ? STOP_HOOK_TIMEOUT_S
          : DEFAULT_TIMEOUT_S
    const group: Record<string, unknown> = { hooks: [hook(timeout)] }
    if (event === 'PostToolUse' || event === 'PostToolUseFailure') group.matcher = '*'
    hooks[event] = [group]
  }
  return { hooks }
}
