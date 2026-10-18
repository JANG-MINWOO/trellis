import { useTranslation } from 'react-i18next'
import type { TaskCheck } from '@shared/task-check'
import { Button } from '../../components/ui'
import { relativeTime } from '../../lib/format'

/**
 * "Still working on this task?" — shown in the intent card, never blocking the terminal. The
 * signal only decides when to ask; the human decides where the task ends (ADR-0034).
 */
export function TaskCheckNotice({
  check,
  prompt,
  onKeep,
  onFinish,
  onNewTask,
}: {
  check: TaskCheck
  /** The prompt of the turn at the boundary, when there is one. */
  prompt: string | null
  onKeep: () => void
  onFinish: () => void
  onNewTask: () => void
}) {
  const { t } = useTranslation()
  const snippet = (prompt ?? '').replace(/\s+/g, ' ').slice(0, 80)
  const reason = {
    'new-conversation': t('intent.check.newConversation'),
    idle: t('intent.check.idle', { ago: relativeTime(check.boundary) }),
    'off-intent': t('intent.check.offIntent', { prompt: snippet }),
    'off-prediction': t('intent.check.offPrediction', { prompt: snippet }),
  }[check.reason]

  return (
    <div
      className="mt-2 rounded-md bg-warning-soft px-2.5 py-2 text-xs leading-relaxed"
      data-testid="task-check"
      data-reason={check.reason}
    >
      <p className="text-warning">{reason}</p>
      <p className="font-medium text-fg">{t('intent.check.question')}</p>
      <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
        <Button size="xs" variant="ghost" onClick={onFinish} data-testid="task-check-finish">
          {t('intent.check.finish')}
        </Button>
        <Button size="xs" onClick={onNewTask} data-testid="task-check-new">
          {t('intent.check.newTask')}
        </Button>
        <Button size="xs" variant="primary" onClick={onKeep} data-testid="task-check-keep">
          {t('intent.check.keep')}
        </Button>
      </div>
    </div>
  )
}
