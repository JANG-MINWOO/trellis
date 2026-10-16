import { useTranslation } from 'react-i18next'
import type { LaunchMode } from '@shared/types'
import { FieldRow, Segmented } from '../../components/ui'
import { api } from '../../lib/api'
import { shortenHome } from '../../lib/format'
import { useApi } from '../../lib/use-api'
import { PermissionSelect } from '../terminal'
import { CommitInput } from './CommitInput'
import type { SectionProps } from './section'

export function ClaudeSection({ settings, update }: SectionProps) {
  const { t } = useTranslation()
  // Checked again when the path changes, so "detected" follows what the user typed.
  const [env] = useApi(() => api.environment.check(), [settings.claude.path])
  return (
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
      <FieldRow label={t('settings.defaultMode')} hint={t('settings.defaultModeHint')} inline>
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
        <PermissionSelect
          value={settings.claude.permissionMode}
          onChange={(permissionMode) => void update({ claude: { permissionMode } })}
        />
      </FieldRow>
      <FieldRow label={t('settings.analysisModel')} hint={t('settings.analysisModelHint')}>
        <CommitInput
          value={settings.analysis.model}
          placeholder="sonnet"
          onCommit={(model) => void update({ analysis: { model: model.trim() || 'sonnet' } })}
        />
      </FieldRow>
      <FieldRow label={t('settings.onProjectOpen')} hint={t('settings.onProjectOpenHint')} inline>
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
  )
}
