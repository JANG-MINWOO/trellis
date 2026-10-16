import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Popover } from 'radix-ui'
import { Bot, Plus, SquareTerminal, X } from 'lucide-react'
import { deriveAgentState } from '@shared/timeline'
import type { TerminalInfo } from '@shared/types'
import { IconButton } from '../../components/ui'
import { cn } from '../../lib/cn'
import { timelineOf } from '../../state/derived'
import { useStore } from '../../state/store'
import { LaunchPanel } from './LaunchPanel'

const DOT = {
  off: 'bg-fg-faint/40',
  idle: 'bg-fg-faint',
  working: 'bg-accent animate-pulse',
  waiting: 'bg-warning',
}

export function tabLabel(
  t: (key: string, o?: Record<string, unknown>) => string,
  terminal: TerminalInfo,
): string {
  const base = terminal.kind === 'claude' ? 'Claude' : t('terminal.shellTab')
  return terminal.index > 1 ? `${base} ${terminal.index}` : base
}

export function TerminalTabs({
  projectId,
  tabs,
  activeId,
}: {
  projectId: string
  tabs: TerminalInfo[]
  activeId: string | null
}) {
  const { t } = useTranslation()
  const setActiveTab = useStore((s) => s.setActiveTab)
  const closeTerminal = useStore((s) => s.closeTerminal)
  const startTerminal = useStore((s) => s.startTerminal)
  const events = useStore((s) => s.events[projectId])
  const [menuOpen, setMenuOpen] = useState(false)
  const timeline = timelineOf(events)

  const close = (terminal: TerminalInfo): void => {
    if (
      terminal.running &&
      terminal.kind === 'claude' &&
      !window.confirm(t('terminal.confirmClose'))
    )
      return
    void closeTerminal(terminal.id)
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto" role="tablist">
        {tabs.map((terminal) => {
          const state =
            terminal.kind !== 'claude'
              ? null
              : terminal.running
                ? deriveAgentState(timeline, terminal.sessionId)
                : 'off'
          const active = terminal.id === activeId
          return (
            <div
              key={terminal.id}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              onClick={() => setActiveTab(projectId, terminal.id)}
              onKeyDown={(e) => e.key === 'Enter' && setActiveTab(projectId, terminal.id)}
              className={cn(
                'no-drag group flex h-7 shrink-0 items-center gap-1.5 rounded-md pr-1 pl-2.5 text-xs font-medium transition-colors',
                active ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
              )}
              data-testid={`tab-${terminal.kind}-${terminal.index}`}
            >
              {terminal.kind === 'claude' ? <Bot size={14} /> : <SquareTerminal size={14} />}
              {tabLabel(t, terminal)}
              {state && <span className={cn('h-1.5 w-1.5 rounded-full', DOT[state])} />}
              {terminal.permissionMode === 'bypass' && (
                <span
                  className="rounded bg-danger-soft px-1 text-3xs font-semibold text-danger"
                  title={t('permission.bypass.label')}
                >
                  !
                </span>
              )}
              <button
                type="button"
                aria-label={t('terminal.closeTab')}
                onClick={(e) => {
                  e.stopPropagation()
                  close(terminal)
                }}
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded text-fg-faint hover:bg-surface-3 hover:text-fg',
                  active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                )}
                data-testid="tab-close"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
      </div>
      <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Popover.Trigger asChild>
          <span>
            <IconButton label={t('terminal.newTab')} data-testid="new-tab">
              <Plus size={15} />
            </IconButton>
          </span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="z-50 w-[360px] rounded-xl border border-border bg-surface p-4 shadow-pop"
          >
            <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-fg">
              <Bot size={15} />
              {t('terminal.newClaude')}
            </div>
            <LaunchPanel projectId={projectId} newTab onStarted={() => setMenuOpen(false)} />
            <div className="my-4 h-px bg-border" />
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                void startTerminal(projectId, 'shell', { newTab: true })
              }}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-fg hover:bg-surface-2"
              data-testid="new-shell"
            >
              <SquareTerminal size={14} />
              {t('terminal.newShell')}
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
