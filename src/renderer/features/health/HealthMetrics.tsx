import { useTranslation } from 'react-i18next'
import type { HealthReport } from '@shared/types'
import { Notice, PathLabel, SectionLabel } from '../../components/ui'
import { areaLabel } from '../../lib/area'
import { cn } from '../../lib/cn'
import { formatNumber } from '../../lib/format'

/** Size indicators: counts, longest files, crowded folders. */
export function HealthMetrics({
  report,
  onOpen,
}: {
  report: HealthReport
  onOpen: (path: string) => void
}) {
  const { t } = useTranslation()
  const maxLines = report.largestFiles[0]?.lines ?? 1
  return (
    <>
      {report.truncated && (
        <Notice tone="warning" className="mt-3">
          {t('health.truncated')}
        </Notice>
      )}

      <SectionLabel bare className="mt-5 mb-2">
        {t('health.largest')}
      </SectionLabel>
      <ul className="space-y-1">
        {report.largestFiles.map((f) => {
          const over = f.lines > report.lineThreshold
          return (
            <li key={f.path}>
              <button
                type="button"
                onClick={() => onOpen(f.path)}
                className="w-full rounded-md px-1.5 py-1 text-left hover:bg-surface-2"
                title={f.path}
              >
                <div className="flex items-baseline gap-1.5 text-xs">
                  <PathLabel path={f.path} grow nameClassName="font-medium" />
                  <span
                    className={cn(
                      'shrink-0 tabular-nums',
                      over ? 'font-semibold text-warning' : 'text-fg-muted',
                    )}
                  >
                    {formatNumber(f.lines)}
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={cn('h-full rounded-full', over ? 'bg-warning' : 'bg-accent/60')}
                    style={{ width: `${Math.max(3, (f.lines / maxLines) * 100)}%` }}
                  />
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      <SectionLabel bare className="mt-5 mb-2">
        {t('health.densest')}
      </SectionLabel>
      <ul className="space-y-0.5">
        {report.densestFolders.map((d) => (
          <li
            key={d.path}
            className="flex items-center justify-between rounded-md px-1.5 py-1 text-xs"
          >
            <span className="truncate text-fg">{areaLabel(d.path, t('changes.rootArea'))}</span>
            <span className="text-fg-muted tabular-nums">
              {t('health.fileCount', { count: d.files })}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
