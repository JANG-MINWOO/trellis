// The e2e tests run in Node but evaluate code in the renderer, where window.trellis exists.
import type { TrellisApi } from '../../src/shared/ipc'

declare global {
  const window: { trellis: TrellisApi }
}

export {}
