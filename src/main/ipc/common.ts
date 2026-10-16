import { ipcMain } from 'electron'
import type { Project } from '@shared/types'
import type { AppContext } from '../context'

/** Arguments arrive untyped from the renderer; every handler checks what it uses. */
export const asString = (v: unknown): string => (typeof v === 'string' ? v : '')

export function handle(channel: string, fn: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (_event, ...args) => fn(...args))
}

export function projectOf(ctx: AppContext, id: unknown): Project {
  const p = ctx.registry.get(asString(id))
  if (!p) throw new Error(`Unknown project: ${String(id)}`)
  return p
}
