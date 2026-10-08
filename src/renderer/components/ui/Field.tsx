import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { Switch as S } from 'radix-ui'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'

const control =
  'w-full rounded-md border border-border bg-surface-2 px-2.5 text-sm text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20 disabled:opacity-50'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, 'h-8', className)} spellCheck={false} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(control, 'scroll-thin resize-none py-2 leading-relaxed', className)}
      {...props}
    />
  )
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(control, 'h-8 appearance-none pr-8', className)} {...props}>
        {children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-fg-faint"
      />
    </div>
  )
}

export function Switch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label: string
}) {
  return (
    <S.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-surface-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 data-[state=checked]:bg-accent"
    >
      <S.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  )
}

export function FieldRow({
  label,
  hint,
  children,
  inline,
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  inline?: boolean
}) {
  return (
    <div className={cn('py-3', inline && 'flex items-center justify-between gap-6')}>
      <div className={cn(!inline && 'mb-1.5')}>
        <div className="text-sm font-medium text-fg">{label}</div>
        {hint && <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">{hint}</div>}
      </div>
      {children}
    </div>
  )
}
