import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ListChecks, Scale, ShieldAlert, ShieldCheck } from 'lucide-react'
import { latestIntent, type Task, type TaskProgress } from '@shared/tasks'
import { Badge } from '../../components/ui'
import { areaLabel } from '../../lib/area'
import { cn } from '../../lib/cn'
import { useStore } from '../../state/store'

/**
 * The intent of a task and how the work went so far: predicted areas ticked off as they change,
 * areas nobody predicted, cards still waiting for the human, and must-not concerns. With `done`,
 * the same view is the wrap-up summary.
 */
export function TaskDetails({
  task,
  progress,
  pending,
  done,
  onInvariants,
}: {
  task: Task
  progress: TaskProgress
  pending: { decisions: number; behaviors: number }
  done: boolean
  onInvariants: () => void
}) {
  const { t } = useTranslation()
  const setRightTab = useStore((s) => s.setRightTab)
  const intent = latestIntent(task)
  const root = t('changes.rootArea')
  const predicted = intent.predictedAreas ?? []
  const label = (a: string): string => areaLabel(a, root, true)
  const goal = intent.goal || (intent.mustNot ? '' : intent.text)
  const matched =
    done && progress.predicted && progress.changed.length > 0 && progress.unexpected.length === 0

  return (
    <div className="mt-1.5 space-y-1.5 pl-4.75 text-xs leading-relaxed" data-testid="task-details">
      {goal && (
        <p
          className={cn(
            'whitespace-pre-wrap text-fg-muted',
            done ? 'line-clamp-2' : 'line-clamp-4',
          )}
        >
          {goal}
        </p>
      )}
      {intent.mustNot && (
        <div className="rounded-md bg-warning-soft/60 px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xs font-semibold text-warning">{t('intent.mustNot')}</span>
            <button
              type="button"
              onClick={onInvariants}
              className="flex items-center gap-1 text-2xs text-fg-muted hover:text-fg"
              data-testid="intent-invariants"
            >
              <ShieldCheck size={11} />
              {t('intent.toInvariants')}
            </button>
          </div>
          <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap text-fg-muted">{intent.mustNot}</p>
        </div>
      )}

      {predicted.length > 0 && (
        <Areas title={t('intent.predicted')}>
          {predicted.map((a) => {
            const changed = progress.changed.includes(a)
            return (
              <Chip key={a} title={a} tone={changed ? 'accent' : 'neutral'}>
                {changed && <Check size={10} className="mr-0.5" />}
                {label(a)}
              </Chip>
            )
          })}
        </Areas>
      )}
      {progress.unexpected.length > 0 && (
        <Areas title={t('intent.unexpected')} testId="task-unexpected">
          <Capped areas={progress.unexpected} tone="warning" label={label} />
        </Areas>
      )}
      {predicted.length === 0 && progress.changed.length > 0 && (
        <Areas title={t('intent.changed')}>
          <Capped areas={progress.changed} tone="neutral" label={label} />
        </Areas>
      )}
      {done && progress.untouched.length > 0 && (
        <p className="text-2xs text-fg-faint" title={progress.untouched.join('\n')}>
          {t('intent.untouched')}: {progress.untouched.map(label).join(', ')}
        </p>
      )}
      {matched && <p className="text-2xs text-success">{t('intent.matched')}</p>}

      {(pending.decisions > 0 || pending.behaviors > 0 || progress.mustNotBroken.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="task-pending">
          {pending.decisions > 0 && (
            <button type="button" onClick={() => setRightTab('decisions')}>
              <Badge tone="warning">
                <Scale size={10} className="mr-1" />
                {t('intent.pendingDecisions', { count: pending.decisions })}
              </Badge>
            </button>
          )}
          {pending.behaviors > 0 && (
            <button type="button" onClick={() => setRightTab('specs')}>
              <Badge tone="info">
                <ListChecks size={10} className="mr-1" />
                {t('intent.pendingBehaviors', { count: pending.behaviors })}
              </Badge>
            </button>
          )}
          {progress.mustNotBroken.length > 0 && (
            <span
              title={progress.mustNotBroken.map((c) => `${c.rule} — ${c.why}`).join('\n')}
              data-testid="task-mustnot"
            >
              <Badge tone="danger">
                <ShieldAlert size={10} className="mr-1" />
                {t('intent.mustNotConcerns')}
              </Badge>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function Areas({
  title,
  testId,
  children,
}: {
  title: string
  testId?: string
  children: ReactNode
}) {
  return (
    <div data-testid={testId}>
      <div className="text-2xs font-medium text-fg-faint">{title}</div>
      <div className="mt-0.5 flex flex-wrap gap-1">{children}</div>
    </div>
  )
}

/** A long task can touch dozens of areas: show the first few and the count of the rest. */
const MAX_CHIPS = 8

function Capped({
  areas,
  tone,
  label,
}: {
  areas: string[]
  tone: 'neutral' | 'warning'
  label: (area: string) => string
}) {
  const rest = areas.slice(MAX_CHIPS)
  return (
    <>
      {areas.slice(0, MAX_CHIPS).map((a) => (
        <Chip key={a} title={a} tone={tone}>
          {label(a)}
        </Chip>
      ))}
      {rest.length > 0 && (
        <Chip title={rest.join('\n')} tone="neutral">
          +{rest.length}
        </Chip>
      )}
    </>
  )
}

function Chip({
  tone,
  title,
  children,
}: {
  tone: 'neutral' | 'accent' | 'warning'
  title: string
  children: ReactNode
}) {
  return (
    <span title={title}>
      <Badge tone={tone}>{children}</Badge>
    </span>
  )
}
