import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Send } from 'lucide-react'
import type { IntentData } from '@shared/types'
import { Button, Textarea } from '../../components/ui'
import { api } from '../../lib/api'
import { areaLabel } from '../../lib/area'
import { cn } from '../../lib/cn'
import { clockTime } from '../../lib/format'

export type FormMode =
  /** A new task; `from` also takes in the turns since then (when Trellis asked about them). */
  { kind: 'new'; from: number | null } | { kind: 'refine'; initial: IntentData }

/** Goal, must-not and predicted areas, written by the human (ADR-0025, 0034). */
export function IntentForm({
  projectId,
  mode,
  onSave,
  onCancel,
}: {
  projectId: string
  mode: FormMode
  onSave: (intent: IntentData, andPaste: boolean) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const initial = mode.kind === 'refine' ? mode.initial : null
  const [goal, setGoal] = useState(
    initial?.goal ?? (initial && !initial.mustNot ? initial.text : ''),
  )
  const [mustNot, setMustNot] = useState(initial?.mustNot ?? '')
  const [predicted, setPredicted] = useState<string[]>(initial?.predictedAreas ?? [])
  const [areas, setAreas] = useState<{ area: string; files: number }[] | null>(null)

  useEffect(() => {
    void api.projects.areas(projectId).then(setAreas)
  }, [projectId])

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

  const togglePredicted = (area: string): void =>
    setPredicted((p) => (p.includes(area) ? p.filter((a) => a !== area) : [...p, area]))
  const empty = !goal.trim() && !mustNot.trim()

  return (
    <div className="mt-2 space-y-2" data-testid="intent-form">
      {mode.kind === 'refine' && (
        <p className="text-2xs leading-relaxed text-fg-faint">{t('intent.refineHint')}</p>
      )}
      {mode.kind === 'new' && mode.from !== null && (
        <p className="text-2xs leading-relaxed text-fg-faint">
          {t('intent.fromHint', { time: clockTime(mode.from) })}
        </p>
      )}
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
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          size="sm"
          onClick={() => void onSave(compose(), false)}
          disabled={empty}
          data-testid="intent-save"
        >
          {t('common.save')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => void onSave(compose(), true)}
          disabled={empty}
        >
          <Send size={12} />
          {t('intent.saveAndPaste')}
        </Button>
      </div>
    </div>
  )
}
