import { useTranslation } from 'react-i18next'
import { ListTree, Play, Square, Target } from 'lucide-react'
import type { TimelineItem } from '@shared/timeline'
import { EmptyState } from '../../components/ui'
import { api } from '../../lib/api'
import { clockTime, relativeTime } from '../../lib/format'
import { useTimeline } from '../../state/derived'
import { useActiveProject, useStore } from '../../state/store'
import { TurnCard } from './TurnCard'

export function TimelinePanel() {
  const { t } = useTranslation()
  const project = useActiveProject()
  const items = useTimeline(project?.id ?? null)
  const toast = useStore((s) => s.toast)
  if (!project) return null

  const openFile = async (path: string): Promise<void> => {
    const result = await api.editor.open(project.id, path)
    if (!result.ok) toast('error', t('toast.editorFailed', { message: result.message ?? '' }))
  }

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
      {[...items].reverse().map((item) => (
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
