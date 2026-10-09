import { useMemo } from 'react'
import { pendingDecisions } from '@shared/decisions'
import { pendingBehaviors } from '@shared/specs'
import { useTranslation } from 'react-i18next'
import { Tabs } from 'radix-ui'
import { cn } from '../../lib/cn'
import { useTimeline } from '../../state/derived'
import { useActiveProject, useStore, type RightTab } from '../../state/store'
import { ChangesPanel } from '../changes'
import { DecisionsPanel } from '../decisions'
import { HealthPanel } from '../health'
import { IntentCard } from '../intent'
import { SpecsPanel } from '../specs'
import { TimelinePanel } from '../timeline'

export function Inspector() {
  const { t } = useTranslation()
  const project = useActiveProject()
  const tab = useStore((s) => s.rightTab)
  const setTab = useStore((s) => s.setRightTab)
  const report = useStore((s) => (project ? s.changes[project.id] : undefined))
  const timeline = useTimeline(project?.id ?? null)
  const turnCount = useMemo(() => timeline.filter((i) => i.type === 'turn').length, [timeline])
  const changeCount = report?.kind === 'ok' ? report.totals.files : 0
  const events = useStore((s) => (project ? s.events[project.id] : undefined))
  const pending = useMemo(
    () =>
      events
        ? { decisions: pendingDecisions(events).length, behaviors: pendingBehaviors(events).length }
        : null,
    [events],
  )

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center bg-surface px-6 text-center text-xs text-fg-faint">
        {t('inspector.noProject')}
      </div>
    )
  }

  const trigger = (value: RightTab, label: string, count?: number, attention = false) => (
    <Tabs.Trigger
      value={value}
      className={cn(
        'relative flex h-10 items-center gap-1.5 px-1 text-xs font-medium text-fg-muted transition-colors outline-none hover:text-fg',
        'data-[state=active]:text-fg data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-full data-[state=active]:after:bg-accent',
      )}
    >
      {label}
      {!!count && (
        <span
          className={cn(
            'rounded px-1 text-2xs tabular-nums',
            attention ? 'bg-warning-soft text-warning' : 'bg-surface-3 text-fg-muted',
          )}
        >
          {count}
        </span>
      )}
    </Tabs.Trigger>
  )

  return (
    <div className="flex h-full min-w-0 flex-col bg-surface">
      <IntentCard key={project.id} />
      <Tabs.Root
        value={tab}
        onValueChange={(v) => setTab(v as RightTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <Tabs.List className="scroll-thin flex shrink-0 gap-3.5 overflow-x-auto border-b border-border px-3">
          {trigger('timeline', t('timeline.title'), turnCount)}
          {trigger('changes', t('changes.title'), changeCount)}
          {trigger('decisions', t('decisions.title'), pending?.decisions, true)}
          {trigger('specs', t('specs.title'), pending?.behaviors, true)}
          {trigger('health', t('health.title'))}
        </Tabs.List>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <Tabs.Content value="timeline" className="outline-none">
            <TimelinePanel />
          </Tabs.Content>
          <Tabs.Content value="changes" className="outline-none">
            <ChangesPanel />
          </Tabs.Content>
          <Tabs.Content value="decisions" className="outline-none">
            <DecisionsPanel />
          </Tabs.Content>
          <Tabs.Content value="specs" className="outline-none">
            <SpecsPanel />
          </Tabs.Content>
          <Tabs.Content value="health" className="outline-none">
            <HealthPanel />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  )
}
