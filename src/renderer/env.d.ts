import type { TrellisApi } from '@shared/ipc'

declare global {
  interface Window {
    trellis: TrellisApi
  }
}

export {}
