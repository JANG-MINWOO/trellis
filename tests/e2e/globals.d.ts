// The e2e tests run in Node but evaluate code in the renderer, where window.trellis exists.
import type { TrellisApi } from '../../src/shared/ipc'

declare global {
  const window: { trellis: TrellisApi }
  // Browser APIs used inside page.evaluate callbacks (tests compile without the DOM lib).
  const DataTransfer: { new (): { items: { add(file: File): void } } }
  const ClipboardEvent: {
    new (
      type: string,
      init: { clipboardData: unknown; bubbles?: boolean; cancelable?: boolean },
    ): Event
  }
}

export {}
