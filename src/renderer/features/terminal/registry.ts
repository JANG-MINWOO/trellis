import type { Terminal } from '@xterm/xterm'
import { api } from '../../lib/api'

const terminals = new Map<string, Terminal>()

export function registerTerminal(id: string, term: Terminal): void {
  terminals.set(id, term)
}

export function unregisterTerminal(id: string): void {
  terminals.delete(id)
}

/** Types text into a terminal as a paste (bracketed when the program asked for it). */
export function pasteIntoTerminal(id: string, text: string): boolean {
  const term = terminals.get(id)
  if (!term) return false
  term.paste(text)
  term.focus()
  return true
}

export function focusTerminal(id: string): void {
  terminals.get(id)?.focus()
}

type OutputHandler = (data: string) => void
const outputs = new Map<string, OutputHandler>()
let stopOutput: (() => void) | null = null

/** One IPC listener for all terminals; each chunk goes only to the terminal it belongs to. */
export function onTerminalOutput(id: string, handler: OutputHandler): () => void {
  outputs.set(id, handler)
  stopOutput ??= api.terminal.onData((msg) => outputs.get(msg.terminalId)?.(msg.data))
  return () => {
    if (outputs.get(id) === handler) outputs.delete(id)
    if (outputs.size === 0) {
      stopOutput?.()
      stopOutput = null
    }
  }
}
