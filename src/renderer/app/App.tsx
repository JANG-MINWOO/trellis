import { useEffect } from 'react'
import { TooltipProvider } from '../components/ui'
import { EditorChooser } from '../features/editors'
import { OnboardingScreen } from '../features/onboarding'
import { SettingsDialog } from '../features/settings'
import { api } from '../lib/api'
import { useStore } from '../state/store'
import { AppShell } from './AppShell'
import { TitleBar } from './TitleBar'
import { Toasts } from './Toasts'

function useTheme(): void {
  const theme = useStore((s) => s.settings?.theme ?? 'system')
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
      useStore.setState({ isDark: dark })
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}

function useMenuCommands(): void {
  useEffect(
    () =>
      api.menu.onCommand((command) => {
        const s = useStore.getState()
        switch (command) {
          case 'open-folder':
            void s.addProject()
            break
          case 'open-settings':
            s.openSettings()
            break
          case 'toggle-left':
          case 'toggle-right':
            s.togglePanel(command === 'toggle-left' ? 'left' : 'right')
            break
          case 'claude-continue':
          case 'claude-new':
            if (s.activeProjectId)
              void s.startTerminal(s.activeProjectId, 'claude', {
                mode: command === 'claude-new' ? 'new' : 'continue',
              })
            break
          case 'claude-new-tab':
            if (s.activeProjectId)
              void s.startTerminal(s.activeProjectId, 'claude', { mode: 'new', newTab: true })
            break
        }
      }),
    [],
  )
}

export function App() {
  const booted = useStore((s) => s.booted)
  const language = useStore((s) => s.settings?.language)
  useTheme()
  useMenuCommands()

  useEffect(() => {
    const block = (e: DragEvent): void => e.preventDefault()
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = useStore.getState().subscribe()
    void useStore.getState().boot()
    return unsubscribe
  }, [])

  if (!booted) return <div className="h-full bg-canvas" />

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col bg-canvas text-fg">
        {language === null ? (
          <>
            <TitleBar minimal />
            <OnboardingScreen />
          </>
        ) : (
          <AppShell />
        )}
        <SettingsDialog />
        <EditorChooser />
        <Toasts />
      </div>
    </TooltipProvider>
  )
}
