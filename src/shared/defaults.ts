import type { Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  language: null,
  theme: 'system',
  claude: { path: '', extraArgs: '', defaultMode: 'continue', autoStart: true },
  editor: { kind: 'auto', customPath: '' },
  terminal: { fontSize: 13, fontFamily: '' },
  notifications: { enabled: true },
  lastProjectId: null,
}

export const DEFAULT_DECISIONS_DIR = 'docs/decisions'
export const HEALTH_LINE_THRESHOLD = 300
