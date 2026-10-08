import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'xs' | 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 active:brightness-95',
  secondary: 'bg-surface-2 text-fg border border-border hover:bg-surface-3',
  ghost: 'text-fg-muted hover:text-fg hover:bg-surface-2',
  danger: 'bg-danger-soft text-danger hover:bg-danger/20',
}

const SIZES: Record<Size, string> = {
  xs: 'h-6 px-2 text-2xs gap-1 rounded',
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-8 px-3 text-sm gap-1.5 rounded-md',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'no-drag inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors outline-none select-none',
        'focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-45',
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
}
