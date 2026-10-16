import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, FileCode, FolderOpen, Settings2, SquareTerminal } from 'lucide-react'
import { Dialog } from '../../components/ui'
import { cn } from '../../lib/cn'
import { useActiveProject, useStore, type SettingsSection } from '../../state/store'
import { ClaudeSection } from './ClaudeSection'
import { EditorSection } from './EditorSection'
import { GeneralSection } from './GeneralSection'
import { ProjectSettings } from './ProjectSettings'
import { TerminalSection } from './TerminalSection'

export function SettingsDialog() {
  const { t } = useTranslation()
  const open = useStore((s) => s.settingsOpen)
  const section = useStore((s) => s.settingsSection)
  const settings = useStore((s) => s.settings)
  const update = useStore((s) => s.updateSettings)
  const close = useStore((s) => s.closeSettings)
  const openSettings = useStore((s) => s.openSettings)
  const project = useActiveProject()

  if (!settings) return null

  const nav: { id: SettingsSection; label: string; icon: ReactNode; hidden?: boolean }[] = [
    { id: 'general', label: t('settings.general'), icon: <Settings2 size={14} /> },
    { id: 'claude', label: 'Claude Code', icon: <Bot size={14} /> },
    { id: 'editor', label: t('settings.editor'), icon: <FileCode size={14} /> },
    { id: 'terminal', label: t('settings.terminal'), icon: <SquareTerminal size={14} /> },
    {
      id: 'project',
      label: t('settings.project'),
      icon: <FolderOpen size={14} />,
      hidden: !project,
    },
  ]
  const props = { settings, update }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? openSettings(section) : close())}
      title={t('settings.title')}
      closeLabel={t('common.close')}
      className="h-[560px]"
    >
      <div className="flex min-h-0 flex-1">
        <nav className="w-48 shrink-0 space-y-0.5 border-r border-border p-2">
          {nav
            .filter((n) => !n.hidden)
            .map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => openSettings(n.id)}
                className={cn(
                  'flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-sm',
                  section === n.id
                    ? 'bg-surface-3 font-medium text-fg'
                    : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                {n.icon}
                {n.label}
              </button>
            ))}
        </nav>
        <div className="scroll-thin min-w-0 flex-1 divide-y divide-border overflow-y-auto px-6 py-2">
          {section === 'general' && <GeneralSection {...props} />}
          {section === 'claude' && <ClaudeSection {...props} />}
          {section === 'editor' && <EditorSection {...props} />}
          {section === 'terminal' && <TerminalSection {...props} />}
          {section === 'project' && project && <ProjectSettings project={project} />}
        </div>
      </div>
    </Dialog>
  )
}
