import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CornerDownLeft, ImageIcon } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { clipboardHasOnlyImage, droppedPaths, hasFiles } from '../../lib/drop'
import { useStore } from '../../state/store'
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
  /** Images already handed to Claude's own input (they show there as [Image #N]). */
  const [images, setImages] = useState(0)
  const [dragging, setDragging] = useState(false)
  const platform = useStore((s) => s.appInfo?.platform)
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
    if (!text.trim() && images === 0) return
    if (text.trim() && !pasteIntoTerminal(terminalId, text)) return
    // A separate keystroke, so Claude treats it as "submit" rather than part of the paste.
    window.setTimeout(() => api.terminal.write(terminalId, '\r'), 60)
    setText('')
    setImages(0)
    ref.current?.focus()
  }

  const insertAtCursor = (insert: string): void => {
    const el = ref.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    setText(text.slice(0, start) + insert + text.slice(end))
  }

  return (
    <div
      className="border-t border-border bg-surface px-3 py-2"
      data-testid="composer"
      onDragOver={(e) => {
        if (!hasFiles(e.dataTransfer)) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        setDragging(false)
        const paths = droppedPaths(e.dataTransfer, platform)
        if (paths.length === 0) return
        e.preventDefault()
        insertAtCursor(`${paths.join(' ')} `)
        ref.current?.focus()
      }}
    >
      {images > 0 && (
        <div
          className="mb-1.5 flex items-center gap-1.5 px-1 text-2xs text-accent"
          data-testid="composer-images"
        >
          <ImageIcon size={12} />
          {t('composer.images', { count: images })}
        </div>
      )}
      <div
        className={cn(
          'flex items-end gap-2 rounded-lg border bg-surface-2 px-3 py-2 focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15',
          dragging ? 'border-accent border-dashed' : 'border-border',
        )}
      >
        <textarea
          ref={ref}
          rows={1}
          value={text}
          spellCheck={false}
          placeholder={t('composer.placeholder')}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            if (!clipboardHasOnlyImage(e.clipboardData)) return
            e.preventDefault()
            api.terminal.pasteImage(terminalId)
            setImages((n) => n + 1)
          }}
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
          disabled={!text.trim() && images === 0}
          aria-label={t('composer.send')}
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
            text.trim() || images > 0
              ? 'bg-accent text-accent-fg hover:brightness-110'
              : 'text-fg-faint',
          )}
        >
          <CornerDownLeft size={14} />
        </button>
      </div>
      <p className="mt-1 px-1 text-2xs text-fg-faint">{t('composer.hint')}</p>
    </div>
  )
}
