import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CircleCheck,
  CircleStop,
  FileCode,
  Hand,
  SquareTerminal,
  TriangleAlert,
} from 'lucide-react'
import { turnFiles, type TurnItem } from '@shared/timeline'
import type { ChangeStatus } from '@shared/types'
import { Badge, Spinner } from '../../components/ui'
import { cn } from '../../lib/cn'
import { clockTime, duration, splitPath } from '../../lib/format'

const STATUS_COLOR: Record<ChangeStatus, string> = {
  A: 'text-success',
  M: 'text-warning',
  D: 'text-danger',
  R: 'text-info',
  T: 'text-warning',
}

export function TurnCard({
  turn,
  onOpenFile,
}: {
  turn: TurnItem
  onOpenFile: (path: string) => void
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const commands = turn.tools.filter((x) => x.command)
  const failures = turn.tools.filter((x) => x.failed)
  const allFiles = turnFiles(turn)
  const files = expanded ? allFiles : allFiles.slice(0, 4)
  const elapsed = turn.endedAt !== null ? turn.endedAt - turn.startedAt : null

  const statusIcon = {
    running: <Spinner size={14} className="text-accent" />,
    waiting: <Hand size={14} className="text-warning" />,
    done: <CircleCheck size={14} className="text-success" />,
    interrupted: <CircleStop size={14} className="text-fg-faint" />,
  }[turn.status]

  return (
    <div
      className={cn(
        'rounded-lg border bg-surface px-3 py-2.5',
        turn.status === 'waiting'
          ? 'border-warning/50'
          : turn.status === 'running'
            ? 'border-accent/40'
            : 'border-border',
      )}
      data-testid="turn-card"
    >
      <div className="flex items-center gap-2 text-2xs text-fg-faint">
        {statusIcon}
        <span className="font-medium text-fg-muted">{t(`timeline.status.${turn.status}`)}</span>
        <span>·</span>
        <span>{clockTime(turn.startedAt)}</span>
        {elapsed !== null && (
          <>
            <span>·</span>
            <span>{duration(elapsed)}</span>
          </>
        )}
      </div>

      <p
        className={cn(
          'mt-1.5 text-[12.5px] leading-relaxed whitespace-pre-wrap text-fg',
          !expanded && 'line-clamp-3',
        )}
      >
        {turn.prompt}
      </p>

      {turn.status === 'waiting' && turn.waitingMessage && (
        <div className="mt-2 rounded-md bg-warning-soft px-2 py-1.5 text-xs text-warning">
          {turn.waitingMessage}
        </div>
      )}

      {(allFiles.length > 0 || commands.length > 0 || failures.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {allFiles.length > 0 && (
            <Badge tone="accent">
              <FileCode size={10} className="mr-1" />
              {t('timeline.files', { count: allFiles.length })}
              {turn.changesTruncated && '+'}
            </Badge>
          )}
          {commands.length > 0 && (
            <Badge>
              <SquareTerminal size={10} className="mr-1" />
              {t('timeline.commands', { count: commands.length })}
            </Badge>
          )}
          {failures.length > 0 && (
            <Badge tone="danger">
              <TriangleAlert size={10} className="mr-1" />
              {t('timeline.failures', { count: failures.length })}
            </Badge>
          )}
        </div>
      )}

      {files.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {files.map((f) => {
            const [name, dir] = splitPath(f.path)
            return (
              <li key={f.path}>
                <button
                  type="button"
                  onClick={() => f.status !== 'D' && onOpenFile(f.path)}
                  className="flex w-full min-w-0 items-baseline gap-1.5 rounded px-1 py-0.5 text-left text-xs hover:bg-surface-2"
                  title={f.path}
                >
                  {f.status && (
                    <span
                      className={cn('w-3 shrink-0 text-[10px] font-bold', STATUS_COLOR[f.status])}
                    >
                      {f.status}
                    </span>
                  )}
                  <span className="shrink-0 font-medium text-fg">{name}</span>
                  <span className="truncate text-2xs text-fg-faint">{dir}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {expanded && commands.length > 0 && (
        <div className="mt-2 space-y-1">
          {commands.map((c, i) => (
            <div
              key={i}
              className={cn(
                'truncate rounded bg-surface-2 px-1.5 py-1 font-mono text-2xs',
                c.failed ? 'text-danger' : 'text-fg-muted',
              )}
              title={c.command ?? ''}
            >
              $ {c.command}
            </div>
          ))}
        </div>
      )}

      {turn.lastMessage && (
        <div className="mt-2 border-l-2 border-border pl-2">
          <p
            className={cn(
              'text-xs leading-relaxed whitespace-pre-wrap text-fg-muted',
              !expanded && 'line-clamp-3',
            )}
          >
            {turn.lastMessage}
          </p>
        </div>
      )}

      {(allFiles.length > 4 ||
        commands.length > 0 ||
        turn.prompt.length > 180 ||
        (turn.lastMessage?.length ?? 0) > 180) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-2xs font-medium text-fg-faint hover:text-fg"
        >
          {expanded ? t('common.showLess') : t('common.showMore')}
        </button>
      )}
    </div>
  )
}
