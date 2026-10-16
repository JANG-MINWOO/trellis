import { useTranslation } from 'react-i18next'
import type { Language, ThemePreference } from '@shared/types'
import { FieldRow, Segmented, Select, Switch } from '../../components/ui'
import { api } from '../../lib/api'
import { useApi } from '../../lib/use-api'
import { useStore } from '../../state/store'
import type { SectionProps } from './section'

export function GeneralSection({ settings, update }: SectionProps) {
  const { t } = useTranslation()
  const appInfo = useStore((s) => s.appInfo)
  const [env] = useApi(() => api.environment.check(), [])
  return (
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
      <FieldRow label={t('settings.notifications')} hint={t('settings.notificationsHint')} inline>
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
  )
}
