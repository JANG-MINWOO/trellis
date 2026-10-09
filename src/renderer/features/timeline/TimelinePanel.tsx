import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ListTree, Play, Square, Target } from 'lucide-react'
import type { TimelineItem } from '@shared/timeline'
import { EmptyState } from '../../components/ui'
import { cn } from '../../lib/cn'
import { clockTime, relativeTime } from '../../lib/format'
import { useTimeline } from '../../state/derived'
import { useActiveProject, useStore } from '../../state/store'
import { tabLabel } from '../terminal'
import { TurnCard } from './TurnCard'

export function TimelinePanel() {
  const { t } = useTranslation()
  const project = useActiveProject()
  const items = useTimeline(project?.id ?? null)
  const open = useStore((s) => s.openFile)
  const terminals = useStore((s) => s.terminals)
  const [filter, setFilter] = useState<string>('all')

  // Tabs that have turns, in order of first appearance; with more than one, offer a filter.
  const tabs = useMemo(() => {
    const ids: string[] = []
    for (const item of items) {
      if (item.type === 'turn' && item.terminalId && !ids.includes(item.terminalId))
        ids.push(item.terminalId)
    }
    return ids
  }, [items])
  const active = tabs.includes(filter) ? filter : 'all'
  const visible =
    active === 'all' ? items : items.filter((i) => i.type === 'intent' || i.terminalId === active)

  if (!project) return null

  const openFile = (path: string): Promise<void> => open(project.id, path)

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ListTree size={26} />}
        title={t('timeline.empty')}
        body={t('timeline.emptyHint')}
        className="py-14"
      />
    )
  }

  return (
    <div className="space-y-2 p-3" data-testid="timeline">
      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-1 pb-1" role="radiogroup">
          {['all', ...tabs].map((id) => {
            const terminal = terminals[id]
            const label =
              id === 'all'
                ? t('timeline.allTabs')
                : terminal
                  ? tabLabel(t, terminal)
                  : t('timeline.closedTab')
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active === id}
                onClick={() => setFilter(id)}
                className={cn(
                  'h-6 rounded-full border px-2.5 text-2xs font-medium',
                  active === id
                    ? 'border-accent/50 bg-accent-soft text-accent'
                    : 'border-border text-fg-muted hover:text-fg',
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}
      {[...visible].reverse().map((item) => (
        <Item key={item.key} item={item} onOpenFile={openFile} />
      ))}
    </div>
  )
}

function Item({ item, onOpenFile }: { item: TimelineItem; onOpenFile: (path: string) => void }) {
  const { t } = useTranslation()
  if (item.type === 'turn') return <TurnCard turn={item} onOpenFile={onOpenFile} />
  if (item.type === 'intent') {
    return (
      <div className="rounded-lg border border-dashed border-accent/40 bg-accent-soft/40 px-3 py-2">
        <div className="flex items-center gap-1.5 text-2xs font-medium text-accent">
          <Target size={11} />
          {t('timeline.intentSet')} · {relativeTime(item.ts)}
        </div>
        <p className="mt-1 line-clamp-3 text-xs whitespace-pre-wrap text-fg-muted">{item.text}</p>
      </div>
    )
  }
  const label =
    item.edge === 'end'
      ? t('timeline.sessionEnd')
      : item.detail === 'resume'
        ? t('timeline.sessionResume')
        : item.detail === 'clear'
          ? t('timeline.sessionClear')
          : item.detail === 'compact'
            ? t('timeline.sessionCompact')
            : t('timeline.sessionStart')
  return (
    <div className="flex items-center gap-2 px-1 py-0.5 text-2xs text-fg-faint">
      {item.edge === 'end' ? <Square size={9} /> : <Play size={9} />}
      <span>{label}</span>
      {item.model && <span className="truncate">· {item.model}</span>}
      <span className="ml-auto shrink-0">{clockTime(item.ts)}</span>
    </div>
  )
}
