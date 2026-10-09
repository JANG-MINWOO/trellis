import { useTranslation } from 'react-i18next'
import { ListChecks, Ruler, Scale, TriangleAlert } from 'lucide-react'
import { comparePrediction, type TurnItem } from '@shared/timeline'
import { Badge } from '../../components/ui'
import { areaLabel } from '../../lib/area'
import { useStore } from '../../state/store'

/** What Trellis found in a finished turn: decisions, behavior changes, rule breaks, prediction. */
export function TurnInsights({ turn }: { turn: TurnItem }) {
  const { t } = useTranslation()
  const setRightTab = useStore((s) => s.setRightTab)
  const prediction = comparePrediction(turn)
  const root = t('changes.rootArea')
  const violations = turn.rules?.newViolations.length ?? 0
  const checkFailed = turn.rules?.check ? !turn.rules.check.ok : false
  const analysisFailed = turn.analysis?.status === 'error'
  if (
    turn.decisions.length === 0 &&
    turn.behaviors.length === 0 &&
    !violations &&
    !checkFailed &&
    !analysisFailed &&
    !prediction
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
        {(violations > 0 || checkFailed) && (
          <button type="button" onClick={() => setRightTab('health')}>
            <Badge tone="danger">
              <Ruler size={10} className="mr-1" />
              {violations > 0
                ? t('timeline.violations', { count: violations })
                : t('timeline.checkFailed')}
              {turn.rules?.blocked && ` · ${t('timeline.sentBack')}`}
            </Badge>
          </button>
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
      {prediction && (
        <div
          className="rounded-md bg-surface-2 px-2 py-1.5 text-2xs leading-relaxed"
          data-testid="prediction"
        >
          <span className="font-medium text-fg-muted">{t('timeline.prediction')}</span>{' '}
          {prediction.unpredicted.length === 0 && prediction.untouched.length === 0 ? (
            <span className="text-success">{t('timeline.predictionMatched')}</span>
          ) : (
            <>
              {prediction.unpredicted.length > 0 && (
                <span className="text-warning" title={prediction.unpredicted.join('\n')}>
                  {t('timeline.unpredicted', {
                    areas: prediction.unpredicted.map((a) => areaLabel(a, root, true)).join(', '),
                  })}
                </span>
              )}
              {prediction.unpredicted.length > 0 && prediction.untouched.length > 0 && ' · '}
              {prediction.untouched.length > 0 && (
                <span className="text-fg-faint" title={prediction.untouched.join('\n')}>
                  {t('timeline.untouched', {
                    areas: prediction.untouched.map((a) => areaLabel(a, root, true)).join(', '),
                  })}
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
