import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NotebookPen, RefreshCw, Scale } from 'lucide-react'
import type { DecisionList } from '@shared/types'
import { Badge, Button, EmptyState, IconButton, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { relativeTime } from '../../lib/format'
import { useActiveProject, useStore } from '../../state/store'

function statusTone(status: string | null): 'accent' | 'warning' | 'neutral' {
  if (!status) return 'neutral'
  if (/채택|accepted|approved/i.test(status)) return 'accent'
  if (/제안|proposed|draft/i.test(status)) return 'warning'
  return 'neutral'
}

export function DecisionsPanel() {
  const { t } = useTranslation()
  const project = useActiveProject()
  const fsTick = useStore((s) => (project ? (s.fsTick[project.id] ?? 0) : 0))
  const openSettings = useStore((s) => s.openSettings)
  const openFile = useStore((s) => s.openFile)
  const [list, setList] = useState<DecisionList | null>(null)
  const projectId = project?.id
  const decisionsDir = project?.decisionsDir

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void api.decisions.list(projectId).then((next) => {
      if (!cancelled) setList(next)
    })
    return () => {
      cancelled = true
    }
  }, [projectId, decisionsDir, fsTick])

  if (!project) return null
  if (!list) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  const footer = (
    <p className="px-4 pt-2 pb-4 text-2xs leading-relaxed text-fg-faint">
      {t('decisions.upcoming')}
    </p>
  )

  if (list.kind === 'disabled' || list.kind === 'missing') {
    return (
      <>
        <EmptyState
          icon={<Scale size={26} />}
          title={
            list.kind === 'disabled'
              ? t('decisions.disabled')
              : t('decisions.missing', { dir: list.dir })
          }
          body={list.kind === 'missing' ? t('decisions.missingHint') : undefined}
          className="py-12"
          action={
            <Button onClick={() => openSettings('project')}>{t('decisions.configure')}</Button>
          }
        />
        {footer}
      </>
    )
  }

  return (
    <div data-testid="decisions">
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="text-2xs text-fg-faint">
          {list.dir} · {t('decisions.count', { count: list.docs.length })}
        </span>
        <IconButton
          label={t('common.refresh')}
          onClick={() => void api.decisions.list(project.id).then(setList)}
        >
          <RefreshCw size={13} />
        </IconButton>
      </div>
      {list.docs.length === 0 ? (
        <EmptyState
          icon={<NotebookPen size={24} />}
          title={t('decisions.empty')}
          className="py-10"
        />
      ) : (
        <ul className="space-y-0.5 px-1.5">
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
                  {doc.status && <Badge tone={statusTone(doc.status)}>{doc.status}</Badge>}
                </div>
                <div className="mt-0.5 text-2xs text-fg-faint">{relativeTime(doc.modifiedAt)}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {footer}
    </div>
  )
}
