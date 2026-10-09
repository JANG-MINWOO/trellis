import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CornerDownLeft } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { pasteIntoTerminal } from './registry'

const MAX_ROWS = 8

/**
 * Native text box for talking to Claude. The OS composes the text (Korean IME works normally) and
 * it reaches Claude as one bracketed paste followed by Enter, so Claude Code never sees half-built
 * syllables — its prompt splits Hangul into jamo right after an input-source switch.
 */
export function Composer({ terminalId, focusKey }: { terminalId: string; focusKey: number }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [terminalId, focusKey])

  // Grow with the content, up to MAX_ROWS lines.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20
    el.style.height = `${Math.min(el.scrollHeight, line * MAX_ROWS + 16)}px`
  }, [text])

  const send = (): void => {
    if (!text.trim()) return
    if (!pasteIntoTerminal(terminalId, text)) return
    // A separate keystroke, so Claude treats it as "submit" rather than part of the paste.
    window.setTimeout(() => api.terminal.write(terminalId, '\r'), 60)
    setText('')
    ref.current?.focus()
  }

  return (
    <div className="border-t border-border bg-surface px-3 py-2" data-testid="composer">
      <div className="flex items-end gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          spellCheck={false}
          placeholder={t('composer.placeholder')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Never act while the IME is still composing a syllable.
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            } else if (e.key === 'Escape' && !text) {
              e.preventDefault()
              api.terminal.write(terminalId, '\x1b')
            }
          }}
          className="scroll-thin max-h-48 min-h-5 flex-1 resize-none bg-transparent text-sm leading-5 text-fg outline-none placeholder:text-fg-faint"
          data-testid="composer-input"
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim()}
          aria-label={t('composer.send')}
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
            text.trim() ? 'bg-accent text-accent-fg hover:brightness-110' : 'text-fg-faint',
          )}
        >
          <CornerDownLeft size={14} />
        </button>
      </div>
      <p className="mt-1 px-1 text-2xs text-fg-faint">{t('composer.hint')}</p>
    </div>
  )
}
