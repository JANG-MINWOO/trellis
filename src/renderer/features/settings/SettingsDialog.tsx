import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, FileCode, FolderOpen, Settings2, SquareTerminal } from 'lucide-react'
import type {
  EditorKind,
  EnvironmentStatus,
  Language,
  LaunchMode,
  ThemePreference,
  EditorApp,
  PermissionMode,
} from '@shared/types'
import { Dialog, FieldRow, Segmented, Select, Switch } from '../../components/ui'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { shortenHome } from '../../lib/format'
import { useActiveProject, useStore, type SettingsSection } from '../../state/store'
import { PERMISSION_MODES } from '../terminal'
import { CommitInput } from './CommitInput'
import { ProjectSettings } from './ProjectSettings'

export function SettingsDialog() {
  const { t } = useTranslation()
  const open = useStore((s) => s.settingsOpen)
  const section = useStore((s) => s.settingsSection)
  const settings = useStore((s) => s.settings)
  const appInfo = useStore((s) => s.appInfo)
  const update = useStore((s) => s.updateSettings)
  const close = useStore((s) => s.closeSettings)
  const openSettings = useStore((s) => s.openSettings)
  const project = useActiveProject()
  const [env, setEnv] = useState<EnvironmentStatus | null>(null)
  const [editors, setEditors] = useState<EditorApp[] | null>(null)

  useEffect(() => {
    if (open && section === 'editor') void api.editor.list().then(setEditors)
  }, [open, section])

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
                    Trellis {appInfo?.build}
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
              <FieldRow
                label={t('settings.permissionMode')}
                hint={t(`permission.${settings.claude.permissionMode}.hint`)}
              >
                <Select
                  value={settings.claude.permissionMode}
                  onChange={(e) =>
                    void update({ claude: { permissionMode: e.target.value as PermissionMode } })
                  }
                >
                  {PERMISSION_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {t(`permission.${mode}.label`)}
                    </option>
                  ))}
                </Select>
              </FieldRow>
              <FieldRow
                label={t('settings.onProjectOpen')}
                hint={t('settings.onProjectOpenHint')}
                inline
              >
                <Segmented<'ask' | 'start'>
                  value={settings.claude.onProjectOpen}
                  onChange={(onProjectOpen) => void update({ claude: { onProjectOpen } })}
                  options={[
                    { value: 'ask', label: t('settings.onProjectOpenAsk') },
                    { value: 'start', label: t('settings.onProjectOpenStart') },
                  ]}
                />
              </FieldRow>
            </>
          )}

          {section === 'editor' && (
            <>
              <FieldRow label={t('settings.editorKind')} hint={t('settings.editorKindHint')}>
                <Select
                  value={
                    settings.editor.kind === 'app'
                      ? `app:${settings.editor.app}`
                      : settings.editor.kind
                  }
                  onChange={(e) => {
                    const value = e.target.value
                    void update({
                      editor: value.startsWith('app:')
                        ? { kind: 'app', app: value.slice(4) }
                        : { kind: value as EditorKind },
                    })
                  }}
                >
                  <option value="ask">{t('settings.editorAsk')}</option>
                  {(editors ?? []).map((e) => (
                    <option key={e.id} value={`app:${e.id}`}>
                      {e.name}
                    </option>
                  ))}
                  {settings.editor.kind === 'app' &&
                    !editors?.some((e) => e.id === settings.editor.app) && (
                      <option value={`app:${settings.editor.app}`}>
                        {t('settings.editorMissing', { name: settings.editor.app })}
                      </option>
                    )}
                  <option value="system">{t('settings.editorSystem')}</option>
                  <option value="reveal">
                    {t(appInfo?.platform === 'darwin' ? 'editors.revealMac' : 'editors.reveal')}
                  </option>
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
              <FieldRow label={t('settings.composer')} hint={t('settings.composerHint')} inline>
                <Switch
                  label={t('settings.composer')}
                  checked={settings.terminal.composer}
                  onCheckedChange={(composer) => void update({ terminal: { composer } })}
                />
              </FieldRow>
              <FieldRow label={t('settings.gpu')} hint={t('settings.gpuHint')} inline>
                <Switch
                  label={t('settings.gpu')}
                  checked={settings.terminal.gpu}
                  onCheckedChange={(gpu) => void update({ terminal: { gpu } })}
                />
              </FieldRow>
            </>
          )}

          {section === 'project' && project && <ProjectSettings project={project} />}
        </div>
      </div>
    </Dialog>
  )
}
