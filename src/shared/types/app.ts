// Files, environment and the app itself.

export interface FileNode {
  name: string
  path: string
  isDir: boolean
  ignored: boolean
}

export interface ToolStatus {
  found: boolean
  path: string | null
  version: string | null
}

export interface EnvironmentStatus {
  platform: 'darwin' | 'win32' | 'linux'
  claude: ToolStatus
  git: ToolStatus
  shellEnvResolved: boolean
}

export interface AppInfo {
  version: string
  /** Version plus git commit of the build, e.g. "0.2.0+14ecc50" (dirty builds end in "-dirty"). */
  build: string
  platform: 'darwin' | 'win32' | 'linux'
  isDev: boolean
  locale: string
}

export interface TemplatePlan {
  stack: string
  files: { path: string; exists: boolean; content: string }[]
}
