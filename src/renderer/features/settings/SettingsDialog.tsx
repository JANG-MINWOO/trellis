import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, FileCode, FolderOpen, Settings2, SquareTerminal } from 'lucide-react'
import type {
  EditorKind,
  EnvironmentStatus,
  Language,
  LaunchMode,
  ThemePreference,
} from '@shared/types'
import { Button, Dialog, FieldRow, Input, Segmented, Select, Switch } from '../../components/ui'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { shortenHome } from '../../lib/format'
import { useActiveProject, useStore, type SettingsSection } from '../../state/store'

/** Text input that saves on blur or Enter, not on every keystroke. */
function CommitInput({
  value,
  onCommit,
  placeholder,
  type = 'text',
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  type?: string
}) {
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }
  return (
    <Input
      type={type}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

export function SettingsDialog() {
  const { t } = useTranslation()
  const open = useStore((s) => s.settingsOpen)
  const section = useStore((s) => s.settingsSection)
  const settings = useStore((s) => s.settings)
  const appInfo = useStore((s) => s.appInfo)
  const update = useStore((s) => s.updateSettings)
  const close = useStore((s) => s.closeSettings)
  const openSettings = useStore((s) => s.openSettings)
  const refreshProjects = useStore((s) => s.refreshProjects)
  const project = useActiveProject()
  const [env, setEnv] = useState<EnvironmentStatus | null>(null)

  useEffect(() => {
    if (open && (section === 'claude' || section === 'general'))
      void api.environment.check().then(setEnv)
  }, [open, section, settings?.claude.path])

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

  const updateProject = async (patch: Parameters<typeof api.projects.update>[1]): Promise<void> => {
    if (!project) return
    await api.projects.update(project.id, patch)
    await refreshProjects()
  }

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
          {section === 'general' && (
            <>
              <FieldRow label={t('settings.language')} inline>
                <div className="w-40">
                  <Select
                    value={settings.language ?? 'en'}
                    onChange={(e) => void update({ language: e.target.value as Language })}
                  >
                    <option value="ko">한국어</option>
                    <option value="en">English</option>
                  </Select>
                </div>
              </FieldRow>
              <FieldRow label={t('settings.theme')} inline>
                <Segmented<ThemePreference>
                  value={settings.theme}
                  onChange={(theme) => void update({ theme })}
                  options={[
                    { value: 'system', label: t('settings.themeSystem') },
                    { value: 'dark', label: t('settings.themeDark') },
                    { value: 'light', label: t('settings.themeLight') },
                  ]}
                />
              </FieldRow>
              <FieldRow
                label={t('settings.notifications')}
                hint={t('settings.notificationsHint')}
                inline
              >
                <Switch
                  label={t('settings.notifications')}
                  checked={settings.notifications.enabled}
                  onCheckedChange={(enabled) => void update({ notifications: { enabled } })}
                />
              </FieldRow>
              <FieldRow label={t('settings.about')}>
                <div className="space-y-1 text-xs text-fg-muted">
                  <div>
                    Trellis {appInfo?.version}
                    {appInfo?.isDev ? ' (dev)' : ''}
                  </div>
                  {env && (
                    <div>
                      Claude Code {env.claude.version ?? t('onboarding.notFound')} · git{' '}
                      {env.git.version?.replace(/^git version /, '') ?? t('onboarding.notFound')}
                    </div>
                  )}
                  <div className="text-fg-faint">{t('settings.dataNote')}</div>
                </div>
              </FieldRow>
            </>
          )}

          {section === 'claude' && (
            <>
              <FieldRow
                label={t('settings.claudePath')}
                hint={
                  <>
                    {t('settings.claudePathHint')}
                    {env?.claude.path && (
                      <span className="mt-1 block font-mono text-2xs text-fg-faint">
                        {t('settings.detected')}: {shortenHome(env.claude.path)}{' '}
                        {env.claude.version && `(${env.claude.version})`}
                      </span>
                    )}
                  </>
                }
              >
                <CommitInput
                  value={settings.claude.path}
                  placeholder={env?.claude.path ?? 'claude'}
                  onCommit={(path) => void update({ claude: { path } })}
                />
              </FieldRow>
              <FieldRow label={t('settings.extraArgs')} hint={t('settings.extraArgsHint')}>
                <CommitInput
                  value={settings.claude.extraArgs}
                  placeholder="--model opus"
                  onCommit={(extraArgs) => void update({ claude: { extraArgs } })}
                />
              </FieldRow>
              <FieldRow
                label={t('settings.defaultMode')}
                hint={t('settings.defaultModeHint')}
                inline
              >
                <Segmented<LaunchMode>
                  value={settings.claude.defaultMode}
                  onChange={(defaultMode) => void update({ claude: { defaultMode } })}
                  options={[
                    { value: 'continue', label: t('terminal.continue') },
                    { value: 'new', label: t('terminal.newConversation') },
                  ]}
                />
              </FieldRow>
              <FieldRow label={t('settings.autoStart')} hint={t('settings.autoStartHint')} inline>
                <Switch
                  label={t('settings.autoStart')}
                  checked={settings.claude.autoStart}
                  onCheckedChange={(autoStart) => void update({ claude: { autoStart } })}
                />
              </FieldRow>
            </>
          )}

          {section === 'editor' && (
            <>
              <FieldRow label={t('settings.editorKind')} hint={t('settings.editorKindHint')}>
                <Select
                  value={settings.editor.kind}
                  onChange={(e) => void update({ editor: { kind: e.target.value as EditorKind } })}
                >
                  <option value="auto">{t('settings.editorAuto')}</option>
                  <option value="vscode">Visual Studio Code</option>
                  <option value="cursor">Cursor</option>
                  <option value="system">{t('settings.editorSystem')}</option>
                  <option value="custom">{t('settings.editorCustom')}</option>
                </Select>
              </FieldRow>
              {settings.editor.kind === 'custom' && (
                <FieldRow label={t('settings.customPath')} hint={t('settings.customPathHint')}>
                  <CommitInput
                    value={settings.editor.customPath}
                    onCommit={(customPath) => void update({ editor: { customPath } })}
                  />
                </FieldRow>
              )}
            </>
          )}

          {section === 'terminal' && (
            <>
              <FieldRow label={t('settings.fontSize')} inline>
                <div className="w-24">
                  <CommitInput
                    type="number"
                    value={String(settings.terminal.fontSize)}
                    onCommit={(v) => void update({ terminal: { fontSize: Number(v) || 13 } })}
                  />
                </div>
              </FieldRow>
              <FieldRow label={t('settings.fontFamily')} hint={t('settings.fontFamilyHint')}>
                <CommitInput
                  value={settings.terminal.fontFamily}
                  placeholder="JetBrains Mono, D2Coding"
                  onCommit={(fontFamily) => void update({ terminal: { fontFamily } })}
                />
              </FieldRow>
            </>
          )}

          {section === 'project' && project && (
            <>
              <FieldRow label={t('settings.projectName')}>
                <CommitInput
                  value={project.name}
                  onCommit={(name) => void updateProject({ name })}
                />
              </FieldRow>
              <FieldRow label={t('settings.projectPath')}>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-fg-muted">
                    {project.path}
                  </code>
                  <Button size="sm" onClick={() => void api.projects.reveal(project.id)}>
                    {t(appInfo?.platform === 'darwin' ? 'projects.revealMac' : 'projects.reveal')}
                  </Button>
                </div>
              </FieldRow>
              <FieldRow label={t('settings.decisionsDir')} hint={t('settings.decisionsDirHint')}>
                <CommitInput
                  value={project.decisionsDir}
                  placeholder="docs/decisions"
                  onCommit={(decisionsDir) => void updateProject({ decisionsDir })}
                />
              </FieldRow>
              <FieldRow
                label={t('settings.recordLanguage')}
                hint={t('settings.recordLanguageHint')}
                inline
              >
                <div className="w-44">
                  <Select
                    value={project.recordLanguage ?? 'app'}
                    onChange={(e) =>
                      void updateProject({
                        recordLanguage:
                          e.target.value === 'app' ? null : (e.target.value as Language),
                      })
                    }
                  >
                    <option value="app">{t('settings.followApp')}</option>
                    <option value="ko">한국어</option>
                    <option value="en">English</option>
                  </Select>
                </div>
              </FieldRow>
            </>
          )}
        </div>
      </div>
    </Dialog>
  )
}
