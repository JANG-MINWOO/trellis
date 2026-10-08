import { useTranslation } from 'react-i18next'
import { PanelLeft, PanelRight, Settings, Sprout } from 'lucide-react'
import { IconButton } from '../components/ui'
import { shortenHome } from '../lib/format'
import { useActiveProject, useStore } from '../state/store'

export function TitleBar({ minimal = false }: { minimal?: boolean }) {
  const { t } = useTranslation()
  const project = useActiveProject()
  const platform = useStore((s) => s.appInfo?.platform)
  const togglePanel = useStore((s) => s.togglePanel)
  const openSettings = useStore((s) => s.openSettings)
  const isMac = platform === 'darwin'

  return (
    <div
      className="drag flex h-10 shrink-0 items-center gap-3 border-b border-border bg-surface"
      style={{ paddingLeft: isMac ? 84 : 12, paddingRight: platform === 'win32' ? 150 : 8 }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Sprout size={15} className="shrink-0 text-accent" />
        <span className="text-xs font-semibold text-fg">Trellis</span>
        {!minimal && project && (
          <>
            <span className="text-fg-faint">/</span>
            <span className="truncate text-xs font-medium text-fg">{project.name}</span>
            <span className="hidden truncate text-2xs text-fg-faint lg:inline">
              {shortenHome(project.path)}
            </span>
          </>
        )}
      </div>
      {!minimal && (
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton
            label={t('titlebar.toggleLeft')}
            shortcut={isMac ? '⌘B' : 'Ctrl+B'}
            onClick={() => togglePanel('left')}
          >
            <PanelLeft size={15} />
          </IconButton>
          <IconButton
            label={t('titlebar.toggleRight')}
            shortcut={isMac ? '⌥⌘B' : 'Ctrl+Alt+B'}
            onClick={() => togglePanel('right')}
          >
            <PanelRight size={15} />
          </IconButton>
          <IconButton
            label={t('settings.title')}
            shortcut={isMac ? '⌘,' : 'Ctrl+,'}
            onClick={() => openSettings()}
          >
            <Settings size={15} />
          </IconButton>
        </div>
      )}
    </div>
  )
}
