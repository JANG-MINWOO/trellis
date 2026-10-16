import type { AppContext } from '../context'
import { registerAppIpc } from './app'
import { registerIntentIpc } from './intent'
import { registerProjectIpc } from './projects'
import { registerTerminalIpc } from './terminal'

/** IPC stays thin: check the arguments, call a feature. Logic lives in the feature folders. */
export function registerIpc(ctx: AppContext): void {
  registerAppIpc(ctx)
  registerProjectIpc(ctx)
  registerTerminalIpc(ctx)
  registerIntentIpc(ctx)
}
