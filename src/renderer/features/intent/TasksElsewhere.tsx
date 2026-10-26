import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'
import { latestIntent, type Task } from '@shared/tasks'
import { Button } from '../../components/ui'
import { relativeTime } from '../../lib/format'

const SHOWN = 3

/**
 * Tasks in progress in other conversations, offered when this one has none: the same work can go
 * on here (a new tab, or after `/clear`) without writing the intent again (ADR-0035).
 */
export function TasksElsewhere({
  tasks,
  onTake,
}: {
  tasks: readonly Task[]
  onTake: (task: Task) => void
}) {
  const { t } = useTranslation()
  if (tasks.length === 0) return null
  return (
    <div className="mt-2 space-y-1 pl-4.75" data-testid="tasks-elsewhere">
      <div className="text-2xs font-medium text-fg-muted">{t('intent.elsewhere')}</div>
      {tasks.slice(0, SHOWN).map((task) => {
        const intent = latestIntent(task)
        return (
          <div key={task.taskId} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-fg" title={intent.text}>
              {intent.goal || intent.text}
            </span>
            <span className="shrink-0 text-2xs text-fg-faint">
              {relativeTime(task.continuedAt ?? task.startedAt)}
            </span>
            <Button size="xs" variant="ghost" onClick={() => onTake(task)} data-testid="task-take">
              <ArrowRight size={11} />
              {t('intent.takeHere')}
            </Button>
          </div>
        )
      })}
    </div>
  )
}
