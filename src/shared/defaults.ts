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
  lastProjectId: null,
}

export const DEFAULT_DECISIONS_DIR = 'docs/decisions'
export const HEALTH_LINE_THRESHOLD = 300
