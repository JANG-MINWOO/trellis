import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Tip } from './Tooltip'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  shortcut?: string
  active?: boolean
  tipSide?: 'top' | 'bottom' | 'left' | 'right'
  children: ReactNode
}

export function IconButton({
  label,
  shortcut,
  active,
  tipSide,
  className,
  children,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <Tip label={label} shortcut={shortcut} side={tipSide}>
      <button
        type={type}
        aria-label={label}
        className={cn(
          'no-drag inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors outline-none',
          'hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-40',
          active && 'bg-surface-2 text-fg',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    </Tip>
  )
}
