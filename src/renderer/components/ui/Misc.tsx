import type { ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '../../lib/cn'

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} className={cn('animate-spin text-fg-faint', className)} />
}

type Tone = 'neutral' | 'accent' | 'warning' | 'danger' | 'info'
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-fg-muted',
  accent: 'bg-accent-soft text-accent',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-4.5 shrink-0 items-center rounded px-1.5 text-2xs font-medium tabular-nums',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode
  title: ReactNode
  body?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}
    >
      {icon && <div className="mb-3 text-fg-faint">{icon}</div>}
      <div className="text-sm font-medium text-fg">{title}</div>
      {body && (
        <div className="mt-1 max-w-[300px] text-xs leading-relaxed text-fg-muted">{body}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/**
 * Small uppercase heading of a section. `bare` drops the bar's height and padding, for headings
 * inside panels that already have their own spacing.
 */
export function SectionLabel({
  children,
  actions,
  bare = false,
  className,
}: {
  children: ReactNode
  actions?: ReactNode
  bare?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-between gap-2',
        !bare && 'h-8 px-3',
        className,
      )}
    >
      <span className="truncate text-2xs font-semibold tracking-wide text-fg-faint uppercase">
        {children}
      </span>
      {actions && <div className="flex items-center gap-0.5">{actions}</div>}
    </div>
  )
}

export function Notice({
  tone = 'info',
  children,
  className,
}: {
  tone?: 'info' | 'warning' | 'danger'
  children: ReactNode
  className?: string
}) {
  const toneClass =
    tone === 'warning'
      ? 'bg-warning-soft text-warning'
      : tone === 'danger'
        ? 'bg-danger-soft text-danger'
        : 'bg-info-soft text-info'
  return (
    <div className={cn('rounded-md px-2.5 py-2 text-xs leading-relaxed', toneClass, className)}>
      {children}
    </div>
  )
}

/** Quiet dashed box for "nothing here yet" inside a panel section. */
export function DashedNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'rounded-md border border-dashed border-border px-3 py-3 text-xs leading-relaxed text-fg-faint',
        className,
      )}
    >
      {children}
    </p>
  )
}
