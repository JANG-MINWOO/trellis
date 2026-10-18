import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Flag, Pencil, Plus, RotateCcw, Target } from 'lucide-react'
import { pendingDecisions } from '@shared/decisions'
import { pendingBehaviors } from '@shared/specs'
import { checkTask } from '@shared/task-check'
import { activeTask, latestIntent, taskProgress } from '@shared/tasks'
import type { TurnItem } from '@shared/timeline'
import type { IntentData } from '@shared/types'
import { Button } from '../../components/ui'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { relativeTime } from '../../lib/format'
import { useNow } from '../../lib/use-now'
import { useClaudeTerminal, useTasks, useTimeline } from '../../state/derived'
import { useActiveProject, useStore } from '../../state/store'
import { pasteIntoTerminal } from '../terminal'
import { IntentForm, type FormMode } from './IntentForm'
import { TaskCheckNotice } from './TaskCheckNotice'
import { TaskDetails } from './TaskDetails'

const NO_EVENTS: never[] = []

/**
 * The task the human is working on (ADR-0034): what they are about to do, what must not break and
 * where they expect changes, written before the work. It follows the task across its turns, asks
 * when the work may have moved on, and sums up when the task is finished.
 */
export function IntentCard() {
  const { t } = useTranslation()
  const project = useActiveProject()
  const projectId = project?.id ?? null
  const events = useStore((s) => (projectId ? s.events[projectId] : undefined)) ?? NO_EVENTS
  const toast = useStore((s) => s.toast)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const setRightTab = useStore((s) => s.setRightTab)
  const claude = useClaudeTerminal(projectId)
  const timeline = useTimeline(projectId)
  const tasks = useTasks(projectId)
  const now = useNow(60_000)
  const [form, setForm] = useState<FormMode | null>(null)
  const [open, setOpen] = useState(true)

  const turns = useMemo(() => timeline.filter((i): i is TurnItem => i.type === 'turn'), [timeline])
  const active = activeTask(tasks)
  const shown = active ?? tasks.at(-1) ?? null
  const progress = useMemo(() => (shown ? taskProgress(shown, turns) : null), [shown, turns])
  const pending = useMemo(() => {
    const keys = new Set(progress?.turnKeys ?? [])
    return {
      decisions: pendingDecisions(events).filter((d) => keys.has(d.promptId ?? '')).length,
      behaviors: pendingBehaviors(events).filter((b) => keys.has(b.promptId ?? '')).length,
    }
  }, [events, progress])
  const check = active ? checkTask(active, turns, events, now) : null

  if (!project) return null

  const paste = (text: string): void => {
    if (claude?.running) {
      setActiveTab(project.id, claude.id)
      pasteIntoTerminal(claude.id, text)
    } else {
      toast('info', t('intent.noClaude'))
    }
  }

  const save = async (intent: IntentData, andPaste: boolean): Promise<void> => {
    if (!intent.text || !form) return
    if (form.kind === 'refine' && active) {
      await api.intent.save(project.id, { ...intent, taskId: active.taskId })
    } else {
      const from = form.kind === 'new' ? form.from : null
      // The task in progress ends where the new one starts.
      if (active) await api.intent.done(project.id, active.taskId, from ?? undefined)
      await api.intent.save(project.id, from ? { ...intent, from } : intent)
    }
    setForm(null)
    if (andPaste) paste(intent.text)
  }

  const finish = (at?: number): void => {
    if (active) void api.intent.done(project.id, active.taskId, at)
  }

  const reopen = (): void => {
    // Saving the last intent again under the same task id opens the task again.
    if (shown && !active)
      void api.intent.save(project.id, { ...latestIntent(shown), taskId: shown.taskId })
  }

  const sendInvariants = async (): Promise<void> => {
    const lines = (shown ? (latestIntent(shown).mustNot ?? '') : '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length === 0) return
    await api.specs.fromIntent(project.id, lines, t('specs.generalArea'))
    setRightTab('specs')
    toast('success', t('intent.invariantsSent', { count: lines.length }))
  }

  const edit = (mode: FormMode): void => {
    setForm(mode)
    setOpen(true)
  }

  return (
    <div className="border-b border-border px-3 py-2.5" data-testid="intent-card">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-fg"
        >
          <ChevronRight
            size={13}
            className={cn('shrink-0 text-fg-faint transition-transform', open && 'rotate-90')}
          />
          <Target size={13} className="shrink-0 text-accent" />
          {t('intent.title')}
          {shown && !form && progress && (
            <span className="truncate font-normal text-fg-faint" data-testid="intent-status">
              ·{' '}
              {active
                ? `${t('intent.inProgress')} · ${t('intent.turns', { count: progress.turns })}`
                : `${t('intent.finished')} · ${relativeTime(shown.endedAt ?? shown.startedAt)}`}
            </span>
          )}
        </button>
        {!form && (
          <div className="flex shrink-0 items-center gap-0.5">
            {active ? (
              <>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => edit({ kind: 'refine', initial: latestIntent(active) })}
                  data-testid="intent-refine"
                >
                  <Pencil size={11} />
                  {t('intent.refine')}
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => finish()}
                  data-testid="intent-finish"
                >
                  <Flag size={11} />
                  {t('intent.finish')}
                </Button>
              </>
            ) : (
              <>
                {shown && (
                  <Button size="xs" variant="ghost" onClick={reopen} data-testid="intent-reopen">
                    <RotateCcw size={11} />
                    {t('intent.reopen')}
                  </Button>
                )}
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => edit({ kind: 'new', from: null })}
                  data-testid="intent-edit"
                >
                  {shown ? <Plus size={11} /> : <Pencil size={11} />}
                  {shown ? t('intent.writeNext') : t('intent.write')}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {form && (
        <IntentForm
          projectId={project.id}
          mode={form}
          onSave={save}
          onCancel={() => setForm(null)}
        />
      )}

      {open && !form && active && check && (
        <TaskCheckNotice
          check={check}
          prompt={turns.find((x) => x.startedAt === check.boundary)?.prompt ?? null}
          onKeep={() => void api.intent.keep(project.id, active.taskId)}
          onFinish={() => finish(check.boundary)}
          onNewTask={() => edit({ kind: 'new', from: check.boundary })}
        />
      )}

      {open && !form && shown && progress && (
        <TaskDetails
          task={shown}
          progress={progress}
          pending={pending}
          done={!active}
          onInvariants={() => void sendInvariants()}
        />
      )}

      {open && !form && !shown && (
        <p className="mt-1.5 pl-4.75 text-xs leading-relaxed text-fg-faint">{t('intent.empty')}</p>
      )}
    </div>
  )
}
