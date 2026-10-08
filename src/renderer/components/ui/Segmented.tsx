import { cn } from '../../lib/cn'

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'sm',
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  size?: 'xs' | 'sm'
}) {
  return (
    <div
      className="no-drag inline-flex rounded-md border border-border bg-surface-2 p-0.5"
      role="radiogroup"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[5px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
            size === 'xs' ? 'h-5 px-2 text-2xs' : 'h-6 px-2.5 text-xs',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
