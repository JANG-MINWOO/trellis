import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { NotebookPen, RefreshCw, Scale } from 'lucide-react'
import { pendingDecisions, recordStatusKind } from '@shared/decisions'
import {
  Badge,
  Button,
  DashedNote,
  EmptyState,
  IconButton,
  SectionLabel,
  Spinner,
} from '../../components/ui'
import { api } from '../../lib/api'
import { useApi } from '../../lib/use-api'
import { relativeTime } from '../../lib/format'
import { useActiveProject, useStore } from '../../state/store'
import { DecisionCard } from './DecisionCard'

const STATUS_TONE = { accepted: 'accent', proposed: 'warning', other: 'neutral' } as const

/** Decisions found in turns, waiting for a human (M2), above the decisions already recorded. */
export function DecisionsPanel() {
  const { t } = useTranslation()
  const project = useActiveProject()
  const events = useStore((s) => (project ? s.events[project.id] : undefined))
  const analyzing = useStore((s) => (project ? !!s.analyzing[project.id] : false))
  const fsTick = useStore((s) => (project ? (s.fsTick[project.id] ?? 0) : 0))
  const openSettings = useStore((s) => s.openSettings)
  const openFile = useStore((s) => s.openFile)
  const toast = useStore((s) => s.toast)
  const projectId = project?.id
  const decisionsDir = project?.decisionsDir
  const pending = useMemo(() => (events ? pendingDecisions(events) : []), [events])
  const resolvedCount = useMemo(
    () => events?.filter((e) => e.kind === 'decision.resolved').length ?? 0,
    [events],
  )
  const usage = useMemo(() => {
    const runs = events?.filter((e) => e.kind === 'analysis.run') ?? []
    const failed = runs.filter((e) => e.kind === 'analysis.run' && e.data.status === 'error')
    const last = failed.at(-1)
    return {
      runs: runs.length,
      failed: failed.length,
      lastError: last?.kind === 'analysis.run' ? last.data.message : null,
    }
  }, [events])

  const [list, reloadList] = useApi(projectId ? () => api.decisions.list(projectId) : null, [
    projectId,
    decisionsDir,
    fsTick,
    resolvedCount,
  ])

  if (!project) return null

  const resolve = async (
    candidateId: string,
    answer: Parameters<typeof api.decisions.resolve>[2],
  ): Promise<void> => {
    const result = await api.decisions.resolve(project.id, candidateId, answer)
    if (!result.ok) {
      toast('error', t('decisions.resolveFailed', { message: result.message ?? '' }))
    } else if (answer.resolution === 'accepted') {
      toast(
        'success',
        result.docPath
          ? t('decisions.recorded', { path: result.docPath })
          : t('decisions.recordedLedger'),
      )
    }
  }

  const analysisNote = !project.analysisEnabled ? t('decisions.analysisOff') : null

  return (
    <div data-testid="decisions">
      <div className="space-y-2 p-3">
        <SectionLabel
          bare
          actions={
            analyzing && (
              <span
                className="flex items-center gap-1.5 text-2xs text-fg-faint"
                data-testid="analyzing"
              >
                <Spinner size={11} />
                {t('decisions.analyzing')}
              </span>
            )
          }
        >
          {t('decisions.pendingTitle')}{' '}
          {pending.length > 0 && <span className="text-warning">· {pending.length}</span>}
        </SectionLabel>
        {pending.length === 0 ? (
          <DashedNote>{analysisNote ?? t('decisions.noPending')}</DashedNote>
        ) : (
          pending.map((d) => (
            <DecisionCard
              key={d.candidateId}
              decision={d}
              recordsEnabled={!!project.decisionsDir}
              onResolve={(answer) => resolve(d.candidateId, answer)}
              onOpenFile={(path) => void openFile(project.id, path)}
            />
          ))
        )}
      </div>

      {usage.runs > 0 && (
        <p className="px-3 pb-2 text-2xs text-fg-faint" title={usage.lastError ?? undefined}>
          {t('decisions.usage', { count: usage.runs })}
          {usage.failed > 0 && ` · ${t('decisions.usageFailed', { count: usage.failed })}`}
        </p>
      )}

      <div className="border-t border-border">
        {!list ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : list.kind === 'disabled' || list.kind === 'missing' ? (
          <EmptyState
            icon={<Scale size={24} />}
            title={
              list.kind === 'disabled'
                ? t('decisions.disabled')
                : t('decisions.missing', { dir: list.dir })
            }
            body={list.kind === 'missing' ? t('decisions.missingHint') : undefined}
            className="py-8"
            action={
              <Button onClick={() => openSettings('project')}>{t('decisions.configure')}</Button>
            }
          />
        ) : (
          <>
            <div className="flex items-center justify-between px-3 pt-3 pb-1">
              <span className="text-2xs text-fg-faint">
                {list.dir} · {t('decisions.count', { count: list.docs.length })}
              </span>
              <IconButton label={t('common.refresh')} onClick={reloadList}>
                <RefreshCw size={13} />
              </IconButton>
            </div>
            {list.docs.length === 0 ? (
              <EmptyState
                icon={<NotebookPen size={22} />}
                title={t('decisions.empty')}
                className="py-8"
              />
            ) : (
              <ul className="space-y-0.5 px-1.5 pb-3">
                {list.docs.map((doc) => (
                  <li key={doc.path}>
                    <button
                      type="button"
                      className="w-full rounded-md px-2 py-2 text-left hover:bg-surface-2"
                      title={doc.path}
                      onClick={() => void openFile(project.id, doc.path)}
                    >
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 text-xs leading-snug font-medium text-fg">
                          {doc.title}
                        </span>
                        {doc.status && (
                          <Badge tone={STATUS_TONE[recordStatusKind(doc.status)]}>
                            {doc.status}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 text-2xs text-fg-faint">
                        {relativeTime(doc.modifiedAt)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  )
}
