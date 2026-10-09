import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Pencil, Send, ShieldCheck, Target } from 'lucide-react'
import { currentIntent } from '@shared/timeline'
import type { IntentData } from '@shared/types'
import { Button, Textarea } from '../../components/ui'
import { api } from '../../lib/api'
import { areaLabel } from '../../lib/area'
import { cn } from '../../lib/cn'
import { relativeTime } from '../../lib/format'
import { useClaudeTerminal } from '../../state/derived'
import { useActiveProject, useStore } from '../../state/store'
import { pasteIntoTerminal } from '../terminal'

/**
 * "What I am about to do / what must not break / where I expect changes": written by the human
 * before the work. The prediction is compared with what really changed (F9); "must not" lines can
 * become invariants in the specs (M4).
 */
export function IntentCard() {
  const { t } = useTranslation()
  const project = useActiveProject()
  const events = useStore((s) => (project ? s.events[project.id] : undefined))
  const toast = useStore((s) => s.toast)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const setRightTab = useStore((s) => s.setRightTab)
  const claude = useClaudeTerminal(project?.id ?? null)
  const intent = useMemo(() => (events ? currentIntent(events) : null), [events])
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(true)
  const [goal, setGoal] = useState('')
  const [mustNot, setMustNot] = useState('')
  const [predicted, setPredicted] = useState<string[]>([])
  const [areas, setAreas] = useState<{ area: string; files: number }[] | null>(null)

  if (!project) return null
  const data = intent?.data

  const startEdit = (): void => {
    setGoal(data?.goal ?? (data && !data.goal && !data.mustNot ? data.text : ''))
    setMustNot(data?.mustNot ?? '')
    setPredicted(data?.predictedAreas ?? [])
    setEditing(true)
    setOpen(true)
    void api.projects.areas(project.id).then(setAreas)
  }

  const compose = (): IntentData => {
    const lines = [
      goal.trim() && `${t('intent.goal')}: ${goal.trim()}`,
      mustNot.trim() && `${t('intent.mustNot')}: ${mustNot.trim()}`,
      predicted.length > 0 &&
        `${t('intent.predicted')}: ${predicted.map((a) => areaLabel(a, t('changes.rootArea'))).join(', ')}`,
    ].filter(Boolean)
    return {
      text: lines.join('\n'),
      goal: goal.trim(),
      mustNot: mustNot.trim(),
      predictedAreas: predicted,
    }
  }

  const save = async (andPaste: boolean): Promise<void> => {
    const next = compose()
    if (!next.text) return
    await api.intent.save(project.id, next)
    setEditing(false)
    if (!andPaste) return
    if (claude?.running) {
      setActiveTab(project.id, claude.id)
      pasteIntoTerminal(claude.id, next.text)
    } else {
      toast('info', t('intent.noClaude'))
    }
  }

  const sendInvariants = async (): Promise<void> => {
    const lines = (data?.mustNot ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length === 0) return
    await api.specs.fromIntent(project.id, lines, t('specs.generalArea'))
    setRightTab('specs')
    toast('success', t('intent.invariantsSent', { count: lines.length }))
  }

  const togglePredicted = (area: string): void =>
    setPredicted((p) => (p.includes(area) ? p.filter((a) => a !== area) : [...p, area]))

  return (
    <div className="border-b border-border px-3 py-2.5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-fg"
        >
          <ChevronRight
            size={13}
            className={cn('text-fg-faint transition-transform', open && 'rotate-90')}
          />
          <Target size={13} className="text-accent" />
          {t('intent.title')}
          {intent && !editing && (
            <span className="font-normal text-fg-faint">· {relativeTime(intent.ts)}</span>
          )}
        </button>
        {!editing && (
          <Button size="xs" variant="ghost" onClick={startEdit} data-testid="intent-edit">
            <Pencil size={11} />
            {intent ? t('common.edit') : t('intent.write')}
          </Button>
        )}
      </div>

      {open && !editing && (
        <div className="mt-1.5 space-y-1.5 pl-[19px] text-xs leading-relaxed">
          {!data ? (
            <p className="text-fg-faint">{t('intent.empty')}</p>
          ) : data.goal || data.mustNot ? (
            <>
              {data.goal && (
                <p className="line-clamp-4 whitespace-pre-wrap text-fg-muted">{data.goal}</p>
              )}
              {data.mustNot && (
                <div className="rounded-md bg-warning-soft/60 px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-2xs font-semibold text-warning">
                      {t('intent.mustNot')}
                    </span>
                    <button
                      type="button"
                      onClick={() => void sendInvariants()}
                      className="flex items-center gap-1 text-2xs text-fg-muted hover:text-fg"
                      data-testid="intent-invariants"
                    >
                      <ShieldCheck size={11} />
                      {t('intent.toInvariants')}
                    </button>
                  </div>
                  <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap text-fg-muted">
                    {data.mustNot}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="line-clamp-6 whitespace-pre-wrap text-fg-muted">{data.text}</p>
          )}
          {data?.predictedAreas && data.predictedAreas.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {data.predictedAreas.map((a) => (
                <span
                  key={a}
                  className="rounded bg-surface-3 px-1.5 py-0.5 text-2xs text-fg-muted"
                  title={a}
                >
                  {areaLabel(a, t('changes.rootArea'), true)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="mt-2 space-y-2">
          <label className="block text-2xs font-medium text-fg-muted">
            {t('intent.goal')}
            <Textarea
              autoFocus
              rows={2}
              value={goal}
              placeholder={t('intent.goalPlaceholder')}
              onChange={(e) => setGoal(e.target.value)}
              className="mt-1 text-xs"
              data-testid="intent-goal"
            />
          </label>
          <label className="block text-2xs font-medium text-fg-muted">
            {t('intent.mustNot')}
            <Textarea
              rows={2}
              value={mustNot}
              placeholder={t('intent.mustNotPlaceholder')}
              onChange={(e) => setMustNot(e.target.value)}
              className="mt-1 text-xs"
              data-testid="intent-mustnot"
            />
          </label>
          <div>
            <div className="text-2xs font-medium text-fg-muted">{t('intent.predicted')}</div>
            <p className="text-2xs text-fg-faint">{t('intent.predictedHint')}</p>
            <div className="mt-1 flex max-h-28 flex-wrap gap-1 overflow-y-auto">
              {(areas ?? []).map(({ area, files }) => (
                <button
                  key={area}
                  type="button"
                  title={`${area} · ${files}`}
                  onClick={() => togglePredicted(area)}
                  className={cn(
                    'rounded border px-1.5 py-0.5 text-2xs',
                    predicted.includes(area)
                      ? 'border-accent/60 bg-accent-soft text-accent'
                      : 'border-border text-fg-muted hover:text-fg',
                  )}
                  data-testid="intent-area"
                >
                  {areaLabel(area, t('changes.rootArea'), true)}
                </button>
              ))}
            </div>
          </div>
          <p className="text-2xs leading-relaxed text-fg-faint">{t('intent.hint')}</p>
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              onClick={() => void save(false)}
              disabled={!goal.trim() && !mustNot.trim()}
              data-testid="intent-save"
            >
              {t('common.save')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void save(true)}
              disabled={!goal.trim() && !mustNot.trim()}
            >
              <Send size={12} />
              {t('intent.saveAndPaste')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
