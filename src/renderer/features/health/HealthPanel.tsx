import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import type { HealthReport } from '@shared/types'
import { IconButton, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatNumber, relativeTime } from '../../lib/format'
import { useActiveProject, useStore } from '../../state/store'
import { HealthMetrics } from './HealthMetrics'
import { RulesSection } from './RulesSection'
import { TemplateDialog } from './TemplateDialog'
import { DriftSection, TrendSection } from './TrendSection'

export function HealthPanel() {
  const projectId = useStore((s) => s.activeProjectId)
  return <ProjectHealth key={projectId ?? 'none'} />
}

function ProjectHealth() {
  const { t } = useTranslation()
  const project = useActiveProject()
  const openFile = useStore((s) => s.openFile)
  const toast = useStore((s) => s.toast)
  const fsTick = useStore((s) => (project ? (s.fsTick[project.id] ?? 0) : 0))
  const [report, setReport] = useState<HealthReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState(false)
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

  // Files change while the agent works; the panel follows while it is open, at most once per
  // burst of changes (each refresh snapshots and checks the whole project).
  const first = useRef(true)
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const delay = first.current ? 0 : 1500
    first.current = false
    const timer = setTimeout(() => {
      void api.health.get(projectId).then((next) => {
        if (!cancelled) setReport(next)
      })
    }, delay)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [projectId, fsTick])

  if (!project) return null
  if (!report) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-xs text-fg-faint">
        <Spinner />
        {t('health.computing')}
      </div>
    )
  }

  const open = (path: string): void => void openFile(project.id, path)
  const freeze = async (): Promise<void> => {
    const count = await api.rules.freezeBaseline(project.id)
    toast('success', t('rules.frozenToast', { count }))
    await load()
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
        <Stat
          label={t('health.overThreshold', { lines: report.lineThreshold })}
          value={formatNumber(report.overThresholdCount)}
          tone={report.overThresholdCount > 0 ? 'warning' : undefined}
        />
        <Stat
          label={t('health.violations')}
          value={formatNumber(report.rules.newViolations.length)}
          tone={report.rules.newViolations.length > 0 ? 'warning' : undefined}
        />
      </div>
      <TrendSection trend={report.trend} onOpen={open} />

      <RulesSection
        rules={report.rules}
        onOpen={open}
        onFreeze={freeze}
        onTemplates={() => setTemplates(true)}
      />
      <DriftSection drift={report.drift} onOpen={open} />
      <HealthMetrics report={report} onOpen={open} />

      <TemplateDialog
        projectId={project.id}
        open={templates}
        onOpenChange={setTemplates}
        onDone={(written) => {
          if (written.length > 0)
            toast('success', t('templates.written', { count: written.length }))
          void load()
        }}
      />
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
