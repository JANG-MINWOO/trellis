export type Platform = 'darwin' | 'win32' | 'linux'

export function currentPlatform(): Platform {
  return process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux'
}

export const isWindows = (): boolean => process.platform === 'win32'
export const isMac = (): boolean => process.platform === 'darwin'
