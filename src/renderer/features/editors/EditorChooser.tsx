import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppWindow, FileCode, FolderOpen } from 'lucide-react'
import type { EditorApp, SettingsPatch } from '@shared/types'
import { Dialog, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { useStore } from '../../state/store'

/** Asked once, the first time a file is opened (or when the chosen editor disappears). */
export function EditorChooser() {
  const { t } = useTranslation()
  const request = useStore((s) => s.editorChooser)
  const close = useStore((s) => s.closeEditorChooser)
  const updateSettings = useStore((s) => s.updateSettings)
  const openFile = useStore((s) => s.openFile)
  const isMac = useStore((s) => s.appInfo?.platform === 'darwin')
  const [editors, setEditors] = useState<EditorApp[] | null>(null)

  useEffect(() => {
    if (!request) return
    let cancelled = false
    void api.editor.list().then((list) => {
      if (!cancelled) setEditors(list)
    })
    return () => {
      cancelled = true
    }
  }, [request])

  if (!request) return null

  const choose = async (editor: SettingsPatch['editor']): Promise<void> => {
    await updateSettings({ editor })
    close()
    await openFile(request.projectId, request.path)
  }

  const option = (
    key: string,
    icon: React.ReactNode,
    label: string,
    hint: string | null,
    onClick: () => void,
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left hover:bg-surface-2"
      data-testid={`editor-${key}`}
    >
      <span className="text-fg-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {hint && <span className="block text-2xs text-fg-faint">{hint}</span>}
      </span>
    </button>
  )

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={t('editors.title')}
      description={t('editors.description', { path: request.path })}
      closeLabel={t('common.close')}
      className="w-[460px]"
    >
      <div className="scroll-thin max-h-[60vh] space-y-2 overflow-y-auto p-4">
        {!editors ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (
          <>
            {editors.map((e) =>
              option(
                e.id,
                <FileCode size={16} />,
                e.name,
                null,
                () => void choose({ kind: 'app', app: e.id }),
              ),
            )}
            {option(
              'system',
              <AppWindow size={16} />,
              t('editors.system'),
              t('editors.systemHint'),
              () => void choose({ kind: 'system' }),
            )}
            {option(
              'reveal',
              <FolderOpen size={16} />,
              t(isMac ? 'editors.revealMac' : 'editors.reveal'),
              t('editors.revealHint'),
              () => void choose({ kind: 'reveal' }),
            )}
          </>
        )}
        <p className="pt-1 text-2xs text-fg-faint">{t('editors.changeLater')}</p>
      </div>
    </Dialog>
  )
}
