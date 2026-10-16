import { useTranslation } from 'react-i18next'
import { FieldRow, Switch } from '../../components/ui'
import { CommitInput } from './CommitInput'
import type { SectionProps } from './section'

export function TerminalSection({ settings, update }: SectionProps) {
  const { t } = useTranslation()
  return (
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
  )
}
