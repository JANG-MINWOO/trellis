import { ipcMain } from 'electron'
import { Invoke, Send } from '@shared/ipc'
import type { TerminalStartRequest } from '@shared/types'
import type { AppContext } from '../context'
import { currentPlatform } from '../platform/os'
import { asString, handle } from './common'

export function registerTerminalIpc(ctx: AppContext): void {
  handle(Invoke.terminalStart, (req) => ctx.terminals.start(req as TerminalStartRequest))
  handle(Invoke.terminalKill, (terminalId) => ctx.ptys.kill(asString(terminalId)))
  handle(Invoke.terminalClose, (terminalId) => ctx.ptys.dispose(asString(terminalId)))
  handle(Invoke.terminalList, () => ctx.ptys.list())
  handle(Invoke.terminalAttach, (terminalId) => ctx.ptys.attach(asString(terminalId)))

  ipcMain.on(Send.terminalWrite, (_e, terminalId: unknown, data: unknown) => {
    if (typeof data === 'string') ctx.ptys.write(asString(terminalId), data)
  })
  ipcMain.on(Send.terminalPasteImage, (_e, terminalId: unknown) => {
    const id = asString(terminalId)
    const keys =
      ctx.ptys.get(id)?.kind === 'claude' ? ctx.adapter.imagePasteKeys(currentPlatform()) : null
    if (keys) ctx.ptys.write(id, keys)
  })
  ipcMain.on(Send.terminalResize, (_e, terminalId: unknown, cols: unknown, rows: unknown) => {
    if (typeof cols === 'number' && typeof rows === 'number')
      ctx.ptys.resize(asString(terminalId), Math.floor(cols), Math.floor(rows))
  })
}
