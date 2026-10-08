import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import type { HealthReport } from '@shared/types'
import { IconButton, Notice, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatNumber, relativeTime, splitPath } from '../../lib/format'
import { useActiveProject, useStore } from '../../state/store'

export function HealthPanel() {
  const projectId = useStore((s) => s.activeProjectId)
  return <ProjectHealth key={projectId ?? 'none'} />
}

function ProjectHealth() {
  const { t } = useTranslation()
  const project = useActiveProject()
  const toast = useStore((s) => s.toast)
  const [report, setReport] = useState<HealthReport | null>(null)
  const [loading, setLoading] = useState(false)
  const projectId = project?.id

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      setReport(await api.health.get(projectId))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void api.health.get(projectId).then((next) => {
      if (!cancelled) setReport(next)
    })
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (!project) return null
  if (!report) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-xs text-fg-faint">
        <Spinner />
        {t('health.computing')}
      </div>
    )
  }

  const maxLines = report.largestFiles[0]?.lines ?? 1
  const open = async (path: string): Promise<void> => {
    const result = await api.editor.open(project.id, path)
    if (!result.ok) toast('error', t('toast.editorFailed', { message: result.message ?? '' }))
  }

  return (
    <div className="p-3" data-testid="health">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-2xs text-fg-faint">
          {t('health.computedAt', { time: relativeTime(report.computedAt) })}
        </span>
        <div className="flex items-center gap-1">
          {loading && <Spinner size={13} />}
          <IconButton label={t('common.refresh')} onClick={() => void load()}>
            <RefreshCw size={13} />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label={t('health.files')} value={formatNumber(report.fileCount)} />
        <Stat label={t('health.lines')} value={formatNumber(report.totalLines)} />
        <Stat
          label={t('health.overThreshold', { lines: report.lineThreshold })}
          value={formatNumber(report.overThresholdCount)}
          tone={report.overThresholdCount > 0 ? 'warning' : undefined}
        />
      </div>

      {report.truncated && (
        <Notice tone="warning" className="mt-3">
          {t('health.truncated')}
        </Notice>
      )}

      <h4 className="mt-5 mb-2 text-2xs font-semibold tracking-wide text-fg-faint uppercase">
        {t('health.largest')}
      </h4>
      <ul className="space-y-1">
        {report.largestFiles.map((f) => {
          const [name, dir] = splitPath(f.path)
          const over = f.lines > report.lineThreshold
          return (
            <li key={f.path}>
              <button
                type="button"
                onClick={() => void open(f.path)}
                className="w-full rounded-md px-1.5 py-1 text-left hover:bg-surface-2"
                title={f.path}
              >
                <div className="flex items-baseline gap-1.5 text-xs">
                  <span className="shrink-0 font-medium text-fg">{name}</span>
                  <span className="min-w-0 flex-1 truncate text-2xs text-fg-faint">{dir}</span>
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

      <h4 className="mt-5 mb-2 text-2xs font-semibold tracking-wide text-fg-faint uppercase">
        {t('health.densest')}
      </h4>
      <ul className="space-y-0.5">
        {report.densestFolders.map((d) => (
          <li
            key={d.path}
            className="flex items-center justify-between rounded-md px-1.5 py-1 text-xs"
          >
            <span className="truncate text-fg">
              {d.path === '.' ? t('changes.rootArea') : d.path}
            </span>
            <span className="text-fg-muted tabular-nums">
              {t('health.fileCount', { count: d.files })}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-2xs leading-relaxed text-fg-faint">{t('health.upcoming')}</p>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-2.5 py-2">
      <div
        className={cn(
          'text-base font-semibold tabular-nums',
          tone === 'warning' ? 'text-warning' : 'text-fg',
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-2xs leading-tight text-fg-faint">{label}</div>
    </div>
  )
}
