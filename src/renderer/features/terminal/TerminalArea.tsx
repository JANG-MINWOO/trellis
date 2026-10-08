import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, FolderPlus, Play, RotateCcw, SquareTerminal, TriangleAlert, X } from 'lucide-react'
import type { TerminalInfo, TerminalKind } from '@shared/types'
import { Button, EmptyState, IconButton } from '../../components/ui'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useClaudeState, type ClaudeState } from '../../state/derived'
import { useActiveProject, useStore } from '../../state/store'
import { XTerm } from './XTerm'

const STATE_DOT: Record<ClaudeState, string> = {
  off: 'bg-fg-faint/40',
  idle: 'bg-fg-faint',
  working: 'bg-accent animate-pulse',
  waiting: 'bg-warning',
}

export function TerminalArea() {
  const { t } = useTranslation()
  const project = useActiveProject()
  const terminals = useStore((s) => s.terminals)
  const activeKind = useStore((s) => (project ? (s.activeKind[project.id] ?? 'claude') : 'claude'))
  const startError = useStore((s) => (project ? s.startErrors[project.id] : undefined))
  const startTerminal = useStore((s) => s.startTerminal)
  const setActiveKind = useStore((s) => s.setActiveKind)
  const addProject = useStore((s) => s.addProject)
  const removeProject = useStore((s) => s.removeProject)
  const openSettings = useStore((s) => s.openSettings)
  const claudeState = useClaudeState(project?.id ?? null)

  const all = useMemo(() => Object.values(terminals), [terminals])
  const current: TerminalInfo | undefined = project
    ? all.find((x) => x.projectId === project.id && x.kind === activeKind)
    : undefined

  // The shell tab starts its shell on first visit.
  useEffect(() => {
    if (project && !project.missing && activeKind === 'shell' && !current)
      void startTerminal(project.id, 'shell')
  }, [project, activeKind, current, startTerminal])

  const tab = (kind: TerminalKind, label: string, icon: React.ReactNode, dot?: string) => (
    <button
      type="button"
      onClick={() => project && setActiveKind(project.id, kind)}
      className={cn(
        'no-drag flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
        activeKind === kind
          ? 'bg-surface-3 text-fg'
          : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      {icon}
      {label}
      {dot && <span className={cn('ml-0.5 h-1.5 w-1.5 rounded-full', dot)} />}
    </button>
  )

  return (
    <div className="flex h-full min-w-0 flex-col bg-terminal">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-2">
        <div className="flex items-center gap-1">
          {tab('claude', 'Claude', <Bot size={14} />, project ? STATE_DOT[claudeState] : undefined)}
          {tab('shell', t('terminal.shellTab'), <SquareTerminal size={14} />)}
        </div>
        {current?.running && (
          <IconButton
            label={current.kind === 'claude' ? t('terminal.stop') : t('terminal.stopShell')}
            onClick={() => void api.terminal.kill(current.id)}
          >
            <X size={15} />
          </IconButton>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {all.map((term) => (
          <XTerm
            key={term.id}
            terminalId={term.id}
            kind={term.kind}
            visible={!!project && term.projectId === project.id && term.kind === activeKind}
          />
        ))}

        {!project && (
          <Overlay>
            <EmptyState
              icon={<FolderPlus size={28} />}
              title={t('terminal.noProjectTitle')}
              body={t('terminal.noProjectBody')}
              action={
                <Button variant="primary" onClick={() => void addProject()}>
                  <FolderPlus size={14} />
                  {t('projects.add')}
                </Button>
              }
            />
          </Overlay>
        )}

        {project?.missing && (
          <Overlay>
            <EmptyState
              icon={<TriangleAlert size={28} />}
              title={t('terminal.projectMissingTitle')}
              body={project.path}
              action={
                <Button variant="danger" onClick={() => void removeProject(project.id)}>
                  {t('projects.remove')}
                </Button>
              }
            />
          </Overlay>
        )}

        {project && !project.missing && activeKind === 'claude' && !current && startError && (
          <Overlay>
            <EmptyState
              icon={<TriangleAlert size={28} className="text-warning" />}
              title={
                startError.reason === 'agent-not-found'
                  ? t('terminal.notFoundTitle')
                  : t('terminal.startFailedTitle')
              }
              body={
                startError.reason === 'agent-not-found'
                  ? t('terminal.notFoundBody')
                  : startError.message
              }
              action={
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    onClick={() => void startTerminal(project.id, 'claude')}
                  >
                    {t('common.retry')}
                  </Button>
                  <Button onClick={() => openSettings('claude')}>
                    {t('terminal.openClaudeSettings')}
                  </Button>
                </div>
              }
            />
          </Overlay>
        )}

        {project && !project.missing && activeKind === 'claude' && !current && !startError && (
          <Overlay>
            <EmptyState
              icon={<Bot size={28} />}
              title={t('terminal.startTitle')}
              body={t('terminal.startBody')}
              action={
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    onClick={() => void startTerminal(project.id, 'claude', 'continue')}
                  >
                    <RotateCcw size={14} />
                    {t('terminal.continue')}
                  </Button>
                  <Button onClick={() => void startTerminal(project.id, 'claude', 'new')}>
                    <Play size={14} />
                    {t('terminal.newConversation')}
                  </Button>
                </div>
              }
            />
          </Overlay>
        )}

        {project && current && !current.running && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5 shadow-pop">
              <span className="text-xs text-fg-muted">
                {t('terminal.exited', { code: current.exitCode ?? '?' })}
              </span>
              {current.kind === 'claude' ? (
                <>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => void startTerminal(project.id, 'claude', 'continue')}
                  >
                    <RotateCcw size={13} />
                    {t('terminal.continue')}
                  </Button>
                  <Button size="sm" onClick={() => void startTerminal(project.id, 'claude', 'new')}>
                    <Play size={13} />
                    {t('terminal.newConversation')}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => void startTerminal(project.id, 'shell')}
                >
                  <RotateCcw size={13} />
                  {t('terminal.restart')}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-terminal">
      {children}
    </div>
  )
}
