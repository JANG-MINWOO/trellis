import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, FolderPlus, Keyboard, RotateCcw, Square, TriangleAlert, X } from 'lucide-react'
import { Badge, Button, EmptyState, IconButton } from '../../components/ui'
import { api } from '../../lib/api'
import { pickTab, tabOrder, useActiveProject, useStore } from '../../state/store'
import { Composer } from './Composer'
import { LaunchPanel } from './LaunchPanel'
import { TerminalTabs } from './TerminalTabs'
import { XTerm } from './XTerm'

export function TerminalArea() {
  const { t } = useTranslation()
  const project = useActiveProject()
  const terminals = useStore((s) => s.terminals)
  const chosenTab = useStore((s) => (project ? s.activeTab[project.id] : null))
  const startError = useStore((s) => (project ? s.startErrors[project.id] : undefined))
  const startTerminal = useStore((s) => s.startTerminal)
  const closeTerminal = useStore((s) => s.closeTerminal)
  const addProject = useStore((s) => s.addProject)
  const removeProject = useStore((s) => s.removeProject)
  const openSettings = useStore((s) => s.openSettings)
  const composerOn = useStore((s) => s.settings?.terminal.composer ?? true)
  const updateSettings = useStore((s) => s.updateSettings)

  const all = useMemo(() => Object.values(terminals), [terminals])
  const tabs = useMemo(
    () => (project ? all.filter((x) => x.projectId === project.id).sort(tabOrder) : []),
    [all, project],
  )
  const activeId = project
    ? tabs.some((x) => x.id === chosenTab)
      ? (chosenTab ?? null)
      : pickTab(tabs, project.id)
    : null
  const current = tabs.find((x) => x.id === activeId)

  return (
    <div className="flex h-full min-w-0 flex-col bg-terminal">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-2">
        {project && !project.missing ? (
          <TerminalTabs projectId={project.id} tabs={tabs} activeId={activeId} />
        ) : (
          <span />
        )}
        {current?.kind === 'claude' && (
          <div className="flex shrink-0 items-center gap-1.5">
            {current.permissionMode && (
              <Badge
                tone={current.permissionMode === 'bypass' ? 'danger' : 'neutral'}
                className="font-normal"
              >
                {t(`permission.${current.permissionMode}.short`)}
              </Badge>
            )}
            <IconButton
              label={t('terminal.composerToggle')}
              active={composerOn}
              aria-pressed={composerOn}
              onClick={() => void updateSettings({ terminal: { composer: !composerOn } })}
              data-testid="composer-toggle"
            >
              <Keyboard size={14} />
            </IconButton>
            {current.running && (
              <IconButton
                label={t('terminal.stop')}
                onClick={() => void api.terminal.kill(current.id)}
                data-testid="stop-claude"
              >
                <Square size={13} />
              </IconButton>
            )}
          </div>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {all.map((term) => (
          <XTerm
            key={term.id}
            terminalId={term.id}
            kind={term.kind}
            visible={term.id === activeId}
            focusOnShow={!(composerOn && term.kind === 'claude')}
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

        {project && !project.missing && tabs.length === 0 && (
          <Overlay>
            <div className="flex w-full flex-col items-center px-6">
              {startError ? (
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
                    <Button onClick={() => openSettings('claude')}>
                      {t('terminal.openClaudeSettings')}
                    </Button>
                  }
                  className="pb-4"
                />
              ) : (
                <EmptyState
                  icon={<Bot size={28} />}
                  title={t('terminal.startTitle')}
                  body={t('terminal.startBody')}
                  className="pb-5"
                />
              )}
              <LaunchPanel projectId={project.id} />
            </div>
          </Overlay>
        )}

        {project && current && !current.running && (
          <Overlay translucent>
            <div className="flex w-[420px] max-w-full flex-col items-center rounded-xl border border-border bg-surface px-6 py-5 shadow-pop">
              <p className="mb-4 text-sm text-fg-muted">
                {t('terminal.exited', { code: current.exitCode ?? '?' })}
              </p>
              {current.kind === 'claude' ? (
                <LaunchPanel projectId={project.id} terminalId={current.id} />
              ) : (
                <Button
                  variant="primary"
                  onClick={() =>
                    void startTerminal(project.id, 'shell', { terminalId: current.id })
                  }
                >
                  <RotateCcw size={14} />
                  {t('terminal.restart')}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="mt-3"
                onClick={() => void closeTerminal(current.id)}
              >
                <X size={13} />
                {t('terminal.closeTab')}
              </Button>
            </div>
          </Overlay>
        )}
      </div>
      {project && current?.kind === 'claude' && current.running && composerOn && (
        <Composer terminalId={current.id} focusKey={current.startedAt} />
      )}
    </div>
  )
}

function Overlay({ children, translucent }: { children: React.ReactNode; translucent?: boolean }) {
  return (
    <div
      className={
        translucent
          ? 'absolute inset-0 z-10 flex items-center justify-center bg-terminal/70 backdrop-blur-[1px]'
          : 'absolute inset-0 z-10 flex items-center justify-center bg-terminal'
      }
    >
      {children}
    </div>
  )
}
