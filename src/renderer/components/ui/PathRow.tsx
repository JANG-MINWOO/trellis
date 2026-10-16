import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { splitPath } from '../../lib/format'

/** "name  folder/path": the file name first, its folder faint and truncated after it. */
export function PathLabel({
  path,
  whole = false,
  nameClassName,
  grow = false,
}: {
  path: string
  /** Show the whole path as the name (folders, where the last part alone says little). */
  whole?: boolean
  nameClassName?: string
  /** Let the folder take the remaining width (rows with right-aligned numbers). */
  grow?: boolean
}) {
  const [name, dir] = whole ? [path, ''] : splitPath(path)
  return (
    <>
      <span className={cn('shrink-0 text-fg', nameClassName)}>{name}</span>
      {dir && (
        <span className={cn('min-w-0 truncate text-2xs text-fg-faint', grow && 'flex-1')}>
          {dir}
        </span>
      )}
    </>
  )
}

/** A file in a panel list; clicking opens it in the editor (when `onOpen` is given). */
export function PathRow({
  path,
  onOpen,
  title,
  leading,
  trailing,
  whole,
  nameClassName,
  testId,
}: {
  path: string
  onOpen?: () => void
  title?: string
  leading?: ReactNode
  trailing?: ReactNode
  whole?: boolean
  nameClassName?: string
  testId?: string
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full min-w-0 items-baseline gap-1.5 rounded px-1.5 py-0.5 text-left text-xs',
        onOpen && 'hover:bg-surface-2',
      )}
      title={title ?? path}
      data-testid={testId}
    >
      {leading}
      <PathLabel path={path} whole={whole} nameClassName={nameClassName} />
      {trailing && <span className="ml-auto shrink-0 text-2xs">{trailing}</span>}
    </button>
  )
}
