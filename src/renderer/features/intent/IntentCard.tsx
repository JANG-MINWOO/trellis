import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Pencil, Send, Target } from 'lucide-react'
import { currentIntent } from '@shared/timeline'
import { Button, Textarea } from '../../components/ui'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { relativeTime } from '../../lib/format'
import { useClaudeTerminal } from '../../state/derived'
import { useActiveProject, useStore } from '../../state/store'
import { pasteIntoTerminal } from '../terminal'

/** "What I am about to do / what must not break": written by the human, before the work. */
export function IntentCard() {
  const { t } = useTranslation()
  const project = useActiveProject()
  const events = useStore((s) => (project ? s.events[project.id] : undefined))
  const toast = useStore((s) => s.toast)
  const setActiveKind = useStore((s) => s.setActiveKind)
  const claude = useClaudeTerminal(project?.id ?? null)
  const intent = useMemo(() => (events ? currentIntent(events) : null), [events])
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(true)
  const [draft, setDraft] = useState('')

  if (!project) return null

  const startEdit = (): void => {
    setDraft(intent?.data.text ?? '')
    setEditing(true)
    setOpen(true)
  }

  const save = async (andPaste: boolean): Promise<void> => {
    const text = draft.trim()
    if (!text) return
    await api.intent.save(project.id, text)
    setEditing(false)
    if (andPaste) {
      if (claude?.running) {
        setActiveKind(project.id, 'claude')
        pasteIntoTerminal(claude.id, text)
      } else {
        toast('info', t('intent.noClaude'))
      }
    }
  }

  return (
    <div className="border-b border-border px-3 py-2.5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-fg"
        >
          <ChevronRight
            size={13}
            className={cn('text-fg-faint transition-transform', open && 'rotate-90')}
          />
          <Target size={13} className="text-accent" />
          {t('intent.title')}
          {intent && !editing && (
            <span className="font-normal text-fg-faint">· {relativeTime(intent.ts)}</span>
          )}
        </button>
        {!editing && (
          <Button size="xs" variant="ghost" onClick={startEdit}>
            <Pencil size={11} />
            {intent ? t('common.edit') : t('intent.write')}
          </Button>
        )}
      </div>

      {open && !editing && (
        <div className="mt-1.5 pl-[19px]">
          {intent ? (
            <p className="line-clamp-6 text-xs leading-relaxed whitespace-pre-wrap text-fg-muted">
              {intent.data.text}
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-fg-faint">{t('intent.empty')}</p>
          )}
        </div>
      )}

      {editing && (
        <div className="mt-2">
          <Textarea
            autoFocus
            rows={6}
            value={draft}
            placeholder={t('intent.placeholder')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save(false)
              if (e.key === 'Escape') setEditing(false)
            }}
            className="text-xs"
          />
          <p className="mt-1.5 text-2xs leading-relaxed text-fg-faint">{t('intent.hint')}</p>
          <div className="mt-2 flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={() => void save(false)} disabled={!draft.trim()}>
              {t('common.save')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void save(true)}
              disabled={!draft.trim()}
            >
              <Send size={12} />
              {t('intent.saveAndPaste')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
