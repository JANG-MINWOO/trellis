import { useTranslation } from 'react-i18next'
import type { EditorKind } from '@shared/types'
import { FieldRow, Select } from '../../components/ui'
import { api } from '../../lib/api'
import { useApi } from '../../lib/use-api'
import { revealKey, useIsMac } from '../../state/derived'
import { CommitInput } from './CommitInput'
import type { SectionProps } from './section'

export function EditorSection({ settings, update }: SectionProps) {
  const { t } = useTranslation()
  const isMac = useIsMac()
  const [editors] = useApi(() => api.editor.list(), [])
  return (
    <>
      <FieldRow label={t('settings.editorKind')} hint={t('settings.editorKindHint')}>
        <Select
          value={
            settings.editor.kind === 'app' ? `app:${settings.editor.app}` : settings.editor.kind
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
          <option value="reveal">{t(revealKey('editors', isMac))}</option>
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
  )
}
