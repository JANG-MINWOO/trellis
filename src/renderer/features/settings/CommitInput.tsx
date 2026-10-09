import { useState } from 'react'
import { Input, Textarea } from '../../components/ui'

/** Text input that saves on blur or Enter, not on every keystroke. */
export function CommitInput({
  value,
  onCommit,
  placeholder,
  type = 'text',
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  type?: string
}) {
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }
  return (
    <Input
      type={type}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

/** One entry per line; saves on blur. */
export function CommitLines({
  value,
  onCommit,
  placeholder,
  rows = 4,
}: {
  value: string[]
  onCommit: (v: string[]) => void
  placeholder?: string
  rows?: number
}) {
  const joined = value.join('\n')
  const [draft, setDraft] = useState(joined)
  const [lastValue, setLastValue] = useState(joined)
  if (joined !== lastValue) {
    setLastValue(joined)
    setDraft(joined)
  }
  return (
    <Textarea
      rows={rows}
      value={draft}
      placeholder={placeholder}
      className="font-mono text-xs"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const lines = draft
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
        if (lines.join('\n') !== joined) onCommit(lines)
      }}
    />
  )
}
