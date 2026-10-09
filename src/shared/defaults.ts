import type { Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  language: null,
  theme: 'system',
  claude: {
    path: '',
    extraArgs: '',
    defaultMode: 'continue',
    permissionMode: 'claude-default',
    onProjectOpen: 'ask',
  },
  editor: { kind: 'ask', app: '', customPath: '' },
  terminal: { fontSize: 13, fontFamily: '', gpu: false, composer: true },
  notifications: { enabled: true },
  analysis: { model: 'sonnet' },
  lastProjectId: null,
}

export const DEFAULT_DECISIONS_DIR = 'docs/decisions'
export const HEALTH_LINE_THRESHOLD = 300
export const DEFAULT_SPECS_DIR = 'docs/specs'
/** Changes here always ask the human, even without analysis. Plain globs, project-relative. */
export const DEFAULT_RISK_AREAS = [
  '**/auth/**',
  '**/*auth*.*',
  '**/payment*/**',
  '**/billing/**',
  '**/migrations/**',
  '**/*.sql',
  '**/security/**',
  '.github/workflows/**',
  '**/Dockerfile',
  '**/.env*',
  // Rules and baseline judge the agent's work; changing them is a human decision (ADR-0027).
  '.trellis/**',
]
