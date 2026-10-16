import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, GitBranch, GitCompareArrows, RefreshCw, RotateCcw } from 'lucide-react'
import type { ChangeEntry, ChangeStatus } from '@shared/types'
import { Button, EmptyState, IconButton, Notice, Segmented, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { areaLabel } from '../../lib/area'
import { cn } from '../../lib/cn'
import { clockTime, dateTime, formatNumber, relativeTime, splitPath } from '../../lib/format'
import { useActiveProject, useStore } from '../../state/store'

const STATUS_STYLE: Record<ChangeStatus, string> = {
  A: 'bg-accent-soft text-success',
  M: 'bg-warning-soft text-warning',
  D: 'bg-danger-soft text-danger',
  R: 'bg-info-soft text-info',
  T: 'bg-warning-soft text-warning',
}

export function ChangesPanel() {
  const { t } = useTranslation()
  const project = useActiveProject()
  const report = useStore((s) => (project ? s.changes[project.id] : undefined))
  const loading = useStore((s) => (project ? !!s.changesLoading[project.id] : false))
  const baseline = useStore((s) => s.baseline)
  const setBaseline = useStore((s) => s.setBaseline)
  const refresh = useStore((s) => s.refreshChanges)
  const toast = useStore((s) => s.toast)
  const open = useStore((s) => s.openFile)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  if (!project) return null

  const openFile = async (entry: ChangeEntry): Promise<void> => {
    if (entry.status === 'D') return
    await open(project.id, entry.path)
  }

  const toolbar = (
    <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
      <Segmented
        value={baseline}
        onChange={setBaseline}
        options={[
          { value: 'session', label: t('changes.sinceSession') },
          { value: 'head', label: t('changes.sinceHead') },
        ]}
      />
      <div className="flex items-center gap-0.5">
        {loading && <Spinner size={13} />}
        {baseline === 'session' && (
          <IconButton
            label={t('changes.resetBaseline')}
            onClick={async () => {
              await api.changes.resetBaseline(project.id)
              refresh(project.id, true)
            }}
          >
            <RotateCcw size={13} />
          </IconButton>
        )}
        <IconButton label={t('common.refresh')} onClick={() => refresh(project.id, true)}>
          <RefreshCw size={13} />
        </IconButton>
      </div>
    </div>
  )

  if (!report) {
    return (
      <>
        {toolbar}
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </>
    )
  }

  if (report.kind === 'not-repo') {
    return (
      <EmptyState
        icon={<GitCompareArrows size={26} />}
        title={t('changes.notRepo')}
        body={t('changes.notRepoHint')}
        className="py-14"
        action={
          <Button
            variant="primary"
            onClick={async () => {
              const result = await api.changes.initRepo(project.id)
              if (result.ok) {
                toast('success', t('toast.gitInitDone'))
                refresh(project.id, true)
              } else {
                toast('error', t('toast.gitInitFailed', { message: result.message ?? '' }))
              }
            }}
          >
            {t('changes.initRepo')}
          </Button>
        }
      />
    )
  }

  if (report.kind === 'error') {
    return (
      <>
        {toolbar}
        <div className="px-3">
          <Notice tone="danger">
            {report.message === 'git-not-found' ? t('changes.gitMissing') : report.message}
          </Notice>
        </div>
      </>
    )
  }

  return (
    <div data-testid="changes">
      {toolbar}
      <div className="flex items-center gap-2 px-3 pb-2 text-2xs text-fg-faint">
        {report.branch && (
          <span className="flex items-center gap-1">
            <GitBranch size={11} />
            {report.branch}
          </span>
        )}
        {report.baseline === 'session' && report.baselineTakenAt && (
          <span title={dateTime(report.baselineTakenAt)}>
            ·{' '}
            {t('changes.baselineAt', {
              time: clockTime(report.baselineTakenAt),
              ago: relativeTime(report.baselineTakenAt),
            })}
          </span>
        )}
      </div>
      {report.baselineFallback && (
        <div className="px-3 pb-2">
          <Notice>{t('changes.fallback')}</Notice>
        </div>
      )}
      {report.totals.files === 0 ? (
        <EmptyState
          title={t('changes.empty')}
          body={
            baseline === 'session' && !report.baselineFallback
              ? t('changes.emptySession')
              : t('changes.emptyHead')
          }
          className="py-10"
        />
      ) : (
        <>
          <div className="mx-3 mb-2 flex items-center gap-3 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs">
            <span className="font-medium text-fg">
              {t('changes.fileCount', { count: report.totals.files })}
            </span>
            <span className="text-success tabular-nums">
              +{formatNumber(report.totals.additions)}
            </span>
            <span className="text-danger tabular-nums">
              −{formatNumber(report.totals.deletions)}
            </span>
            <span className="ml-auto text-fg-faint">
              {t('changes.areaCount', { count: report.groups.length })}
            </span>
          </div>
          <div className="space-y-1 px-1.5 pb-3">
            {report.groups.map((group) => {
              const isCollapsed = collapsed.has(group.area)
              return (
                <div key={group.area}>
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev)
                        if (next.has(group.area)) next.delete(group.area)
                        else next.add(group.area)
                        return next
                      })
                    }
                    className="flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-left hover:bg-surface-2"
                    title={group.area}
                  >
                    <ChevronRight
                      size={13}
                      className={cn(
                        'shrink-0 text-fg-faint transition-transform',
                        !isCollapsed && 'rotate-90',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg">
                      {areaLabel(group.area, t('changes.rootArea'))}
                    </span>
                    <span className="text-2xs text-fg-faint tabular-nums">
                      {group.files.length}
                    </span>
                    <span className="w-10 text-right text-2xs text-success tabular-nums">
                      +{group.additions}
                    </span>
                    <span className="w-10 text-right text-2xs text-danger tabular-nums">
                      −{group.deletions}
                    </span>
                  </button>
                  {!isCollapsed &&
                    group.files.map((f) => {
                      const [name, dir] = splitPath(f.path)
                      return (
                        <button
                          key={f.path}
                          type="button"
                          onClick={() => void openFile(f)}
                          className="flex h-7 w-full items-center gap-2 rounded-md pr-1.5 pl-6 text-left hover:bg-surface-2"
                          title={f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
                        >
                          <span
                            className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold',
                              STATUS_STYLE[f.status],
                            )}
                          >
                            {f.status}
                          </span>
                          <span
                            className={cn(
                              'shrink-0 text-xs',
                              f.status === 'D' ? 'text-fg-faint line-through' : 'text-fg',
                            )}
                          >
                            {name}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-2xs text-fg-faint">
                            {dir}
                          </span>
                          {f.binary ? (
                            <span className="text-2xs text-fg-faint">{t('changes.binary')}</span>
                          ) : (
                            <>
                              <span className="w-10 text-right text-2xs text-success tabular-nums">
                                +{f.additions}
                              </span>
                              <span className="w-10 text-right text-2xs text-danger tabular-nums">
                                −{f.deletions}
                              </span>
                            </>
                          )}
                        </button>
                      )
                    })}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
