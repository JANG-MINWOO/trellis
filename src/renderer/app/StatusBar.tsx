import { useTranslation } from 'react-i18next'
import { Bot, GitBranch } from 'lucide-react'
import { cn } from '../lib/cn'
import { useClaudeState, type ClaudeState } from '../state/derived'
import { useActiveProject, useStore } from '../state/store'

const DOT: Record<ClaudeState, string> = {
  off: 'bg-fg-faint/40',
  idle: 'bg-fg-faint',
  working: 'bg-accent animate-pulse',
  waiting: 'bg-warning',
}

export function StatusBar() {
  const { t } = useTranslation()
  const project = useActiveProject()
  const report = useStore((s) => (project ? s.changes[project.id] : undefined))
  const appInfo = useStore((s) => s.appInfo)
  const setRightTab = useStore((s) => s.setRightTab)
  const state = useClaudeState(project?.id ?? null)

  return (
    <div className="flex h-6 shrink-0 items-center gap-4 border-t border-border bg-surface px-3 text-2xs text-fg-faint">
      {project && report?.kind === 'ok' && (
        <>
          {report.branch && (
            <span className="flex items-center gap-1">
              <GitBranch size={11} />
              {report.branch}
            </span>
          )}
          <button type="button" className="hover:text-fg" onClick={() => setRightTab('changes')}>
            {t('changes.fileCount', { count: report.totals.files })}
          </button>
        </>
      )}
      {project && (
        <span className="flex items-center gap-1.5" data-testid="claude-state">
          <Bot size={11} />
          <span className={cn('h-1.5 w-1.5 rounded-full', DOT[state])} />
          {t(`status.${state}`)}
        </span>
      )}
      <span className="ml-auto">
        Trellis {appInfo?.build}
        {appInfo?.isDev && ' · dev'}
      </span>
    </div>
  )
}
