import type { Terminal } from '@xterm/xterm'

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
