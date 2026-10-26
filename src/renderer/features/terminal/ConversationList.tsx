import { useTranslation } from 'react-i18next'
import { MessageSquare } from 'lucide-react'
import type { ConversationView } from '@shared/types'
import { SectionLabel } from '../../components/ui'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { relativeTime } from '../../lib/format'
import { useApi } from '../../lib/use-api'
import { useStore } from '../../state/store'

/**
 * Conversations of the project Trellis has seen, to open one again with its task (ADR-0035).
 * Ones the agent no longer keeps, or open in another tab, cannot be picked.
 */
export function ConversationList({
  projectId,
  terminalId,
  onPick,
}: {
  projectId: string
  /** The tab that would open it (its own conversation can be picked again). */
  terminalId?: string
  onPick: (sessionId: string) => void
}) {
  const { t } = useTranslation()
  const [list] = useApi(() => api.terminal.conversations(projectId), [projectId])
  const openIn = useStore((s) => {
    const open = new Set<string>()
    for (const x of Object.values(s.terminals))
      if (x.projectId === projectId && x.running && x.id !== terminalId && x.sessionId)
        open.add(x.sessionId)
    return [...open].sort().join(' ')
  })
  if (!list || list.length === 0) return null
  const busy = new Set(openIn.split(' '))

  const status = (c: ConversationView): string =>
    [
      relativeTime(c.lastAt),
      t('intent.turns', { count: c.turns }),
      c.task?.state === 'open' && t('intent.inProgress'),
      c.task?.state === 'done' && t('intent.finished'),
    ]
      .filter(Boolean)
      .join(' · ')

  return (
    <div className="mt-5" data-testid="conversations">
      <SectionLabel bare>{t('launch.conversations')}</SectionLabel>
      <p className="mb-1.5 text-2xs leading-relaxed text-fg-faint">
        {t('launch.conversationsHint')}
      </p>
      <div className="max-h-56 space-y-0.5 overflow-y-auto">
        {list.map((c) => {
          const why = !c.available
            ? t('launch.unavailable')
            : busy.has(c.sessionId)
              ? t('launch.openElsewhere')
              : null
          return (
            <button
              key={c.sessionId}
              type="button"
              disabled={why !== null}
              title={why ?? c.title}
              onClick={() => onPick(c.sessionId)}
              className={cn(
                'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left',
                why ? 'cursor-not-allowed opacity-50' : 'hover:bg-surface-2',
              )}
              data-testid="conversation"
              data-session={c.sessionId}
            >
              <MessageSquare size={13} className="mt-0.5 shrink-0 text-fg-faint" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-fg">{c.title}</span>
                <span className="block text-2xs text-fg-faint">{why ?? status(c)}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
