import { useState } from 'react'
import { Input } from '../../components/ui'

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
