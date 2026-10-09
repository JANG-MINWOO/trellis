import type { ReactNode } from 'react'

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-5 mb-2 flex items-center justify-between gap-2">
      <h4 className="text-2xs font-semibold tracking-wide text-fg-faint uppercase">{children}</h4>
      {action}
    </div>
  )
}
