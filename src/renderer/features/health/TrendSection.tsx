import { useTranslation } from 'react-i18next'
import { TrendingDown, TrendingUp } from 'lucide-react'
import type { DriftItem, HealthTrend } from '@shared/types'
import { cn } from '../../lib/cn'
import { formatNumber, relativeTime, splitPath } from '../../lib/format'
import { SectionTitle } from './SectionTitle'

function Delta({
  label,
  value,
  worseWhenUp = true,
}: {
  label: string
  value: number
  worseWhenUp?: boolean
}) {
  const worse = worseWhenUp ? value > 0 : value < 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1',
        value === 0 ? 'text-fg-faint' : worse ? 'text-warning' : 'text-success',
      )}
    >
      {value > 0 ? <TrendingUp size={11} /> : value < 0 ? <TrendingDown size={11} /> : null}
      {label} {value > 0 ? '+' : ''}
      {formatNumber(value)}
    </span>
  )
}

/** "Worse than last week" (M3). */
export function TrendSection({
  trend,
  onOpen,
}: {
  trend: HealthTrend
  onOpen: (path: string) => void
}) {
  const { t } = useTranslation()
  if (trend.since === null)
    return <p className="mt-3 text-2xs text-fg-faint">{t('health.trendNone')}</p>
  return (
    <section data-testid="trend">
      <SectionTitle>{t('health.trendTitle', { since: relativeTime(trend.since) })}</SectionTitle>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <Delta label={t('health.trendOver')} value={trend.deltas.overThreshold} />
        <Delta label={t('health.trendViolations')} value={trend.deltas.violations} />
        <Delta label={t('health.trendLines')} value={trend.deltas.totalLines} worseWhenUp={false} />
      </div>
      {trend.newlyOverThreshold.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {trend.newlyOverThreshold.map((f) => {
            const [name, dir] = splitPath(f.path)
            return (
              <li key={f.path}>
                <button
                  type="button"
                  onClick={() => onOpen(f.path)}
                  className="flex w-full items-baseline gap-1.5 rounded px-1.5 py-0.5 text-left text-xs hover:bg-surface-2"
                  title={f.path}
                >
                  <span className="text-fg">{name}</span>
                  <span className="min-w-0 truncate text-2xs text-fg-faint">{dir}</span>
                  <span className="ml-auto shrink-0 text-2xs text-warning">
                    {t('health.newlyOver', { lines: f.lines })}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Paths that living documents mention but that no longer exist (M4). */
export function DriftSection({
  drift,
  onOpen,
}: {
  drift: DriftItem[]
  onOpen: (path: string) => void
}) {
  const { t } = useTranslation()
  if (drift.length === 0) return null
  return (
    <section data-testid="drift">
      <SectionTitle>{t('health.driftTitle', { count: drift.length })}</SectionTitle>
      <p className="mb-1.5 text-2xs leading-relaxed text-fg-faint">{t('health.driftHint')}</p>
      <ul className="space-y-0.5">
        {drift.slice(0, 20).map((d) => (
          <li key={`${d.doc}:${d.line}:${d.target}`}>
            <button
              type="button"
              onClick={() => onOpen(d.doc)}
              className="flex w-full items-baseline gap-1.5 rounded px-1.5 py-0.5 text-left text-xs hover:bg-surface-2"
              title={`${d.doc}:${d.line}`}
            >
              <code className="min-w-0 truncate text-warning">{d.target}</code>
              <span className="ml-auto shrink-0 text-2xs text-fg-faint">
                {splitPath(d.doc)[0]}:{d.line}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
