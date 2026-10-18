import { useTranslation } from 'react-i18next'
import { ListChecks, Ruler, Scale, Shuffle, ShieldAlert, TriangleAlert, Undo2 } from 'lucide-react'
import { violationText } from '@shared/rules'
import type { TurnItem } from '@shared/timeline'
import type { RulesCheck } from '@shared/types'
import { Badge } from '../../components/ui'
import { areaLabel } from '../../lib/area'
import { useStore } from '../../state/store'

/** What Trellis found in a finished turn: decisions, behavior changes, rule breaks, prediction. */
export function TurnInsights({ turn }: { turn: TurnItem }) {
  const { t } = useTranslation()
  const setRightTab = useStore((s) => s.setRightTab)
  // Per turn, only what is new in the task: areas changed here first that nobody predicted.
  const prediction = turn.prediction
  const unexpected = prediction?.unexpected ?? []
  const within = prediction?.withinPrediction === true
  const offIntent = turn.analysis?.intentFit === 'no'
  const mustNot = turn.analysis?.mustNotBroken ?? []
  const root = t('changes.rootArea')
  const violations = turn.rules?.newViolations.length ?? 0
  const checkFailed = turn.rules?.check ? !turn.rules.check.ok : false
  const analysisFailed = turn.analysis?.status === 'error'
  const describe = (check: RulesCheck | null): string =>
    (check?.newViolations ?? [])
      .map((v) => {
        const { key, vars } = violationText(v)
        return t(key, vars)
      })
      .concat(
        check?.check && !check.check.ok
          ? [t('guard.checkFailed', { command: check.check.command })]
          : [],
      )
      .join('\n')
  const ruleLines = describe(turn.rules)
  if (
    turn.sentBack === 0 &&
    turn.decisions.length === 0 &&
    turn.behaviors.length === 0 &&
    !violations &&
    !checkFailed &&
    !analysisFailed &&
    unexpected.length === 0 &&
    !within &&
    !offIntent &&
    mustNot.length === 0
  ) {
    return null
  }

  return (
    <div className="mt-2 space-y-1.5" data-testid="turn-insights">
      <div className="flex flex-wrap items-center gap-1.5">
        {turn.decisions.length > 0 && (
          <button type="button" onClick={() => setRightTab('decisions')}>
            <Badge tone="warning">
              <Scale size={10} className="mr-1" />
              {t('timeline.decisions', { count: turn.decisions.length })}
            </Badge>
          </button>
        )}
        {turn.behaviors.length > 0 && (
          <button type="button" onClick={() => setRightTab('specs')}>
            <Badge tone="info">
              <ListChecks size={10} className="mr-1" />
              {t('timeline.behaviors', { count: turn.behaviors.length })}
            </Badge>
          </button>
        )}
        {turn.sentBack > 0 && (
          <span title={describe(turn.sentBackFor)}>
            <Badge tone="warning">
              <Undo2 size={10} className="mr-1" />
              {t('timeline.sentBack', { count: turn.sentBack })}
            </Badge>
          </span>
        )}
        {(violations > 0 || checkFailed) && (
          <button type="button" onClick={() => setRightTab('health')} title={ruleLines}>
            <Badge tone="danger">
              <Ruler size={10} className="mr-1" />
              {violations > 0
                ? t('timeline.violations', { count: violations })
                : t('timeline.checkFailed')}
            </Badge>
          </button>
        )}
        {offIntent && (
          <Badge tone="warning">
            <Shuffle size={10} className="mr-1" />
            {t('timeline.offIntent')}
          </Badge>
        )}
        {mustNot.length > 0 && (
          <span title={mustNot.map((c) => `${c.rule} — ${c.why}`).join('\n')}>
            <Badge tone="danger">
              <ShieldAlert size={10} className="mr-1" />
              {t('timeline.mustNot', { count: mustNot.length })}
            </Badge>
          </span>
        )}
        {analysisFailed && (
          <span title={turn.analysis?.message ?? ''}>
            <Badge>
              <TriangleAlert size={10} className="mr-1" />
              {t('timeline.analysisFailed')}
            </Badge>
          </span>
        )}
      </div>
      {(unexpected.length > 0 || within) && (
        <div
          className="rounded-md bg-surface-2 px-2 py-1.5 text-2xs leading-relaxed"
          data-testid="prediction"
        >
          <span className="font-medium text-fg-muted">{t('timeline.prediction')}</span>{' '}
          {unexpected.length > 0 ? (
            <span className="text-warning" title={unexpected.join('\n')}>
              {t('timeline.unpredicted', {
                areas: unexpected.map((a) => areaLabel(a, root, true)).join(', '),
              })}
            </span>
          ) : (
            <span className="text-success">{t('timeline.predictionMatched')}</span>
          )}
        </div>
      )}
    </div>
  )
}
