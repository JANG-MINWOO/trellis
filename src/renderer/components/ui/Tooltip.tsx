import type { ReactNode } from 'react'
import { Tooltip as T } from 'radix-ui'

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <T.Provider delayDuration={450} skipDelayDuration={200}>
      {children}
    </T.Provider>
  )
}

export function Tip({
  label,
  shortcut,
  side = 'bottom',
  children,
}: {
  label: ReactNode
  shortcut?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: ReactNode
}) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-50 flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg shadow-pop"
        >
          {label}
          {shortcut && <kbd className="font-sans text-2xs text-fg-faint">{shortcut}</kbd>}
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}
