import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import type { TemplatePlan } from '@shared/types'
import { Badge, Button, Dialog, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

/** Starter files for rules and intent docs; shows exactly what will be written, never overwrites. */
export function TemplateDialog({
  projectId,
  open,
  onOpenChange,
  onDone,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (written: string[]) => void
}) {
  const { t } = useTranslation()
  const [plan, setPlan] = useState<TemplatePlan | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void api.templates.plan(projectId).then((next) => {
      if (cancelled) return
      setPlan(next)
      setChosen(next.files.filter((f) => !f.exists).map((f) => f.path))
    })
    return () => {
      cancelled = true
    }
  }, [open, projectId])

  const apply = async (): Promise<void> => {
    setBusy(true)
    try {
      const { written } = await api.templates.apply(projectId, chosen)
      onDone(written)
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('templates.title')}
      description={t('templates.description')}
      closeLabel={t('common.close')}
    >
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {!plan ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-fg-muted">
              {t('templates.stack', { stack: t(`templates.stacks.${plan.stack}`) })}
            </p>
            <ul className="space-y-1.5">
              {plan.files.map((f) => (
                <li key={f.path} className="rounded-md border border-border">
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <input
                      type="checkbox"
                      disabled={f.exists}
                      checked={!f.exists && chosen.includes(f.path)}
                      onChange={(e) =>
                        setChosen((c) =>
                          e.target.checked ? [...c, f.path] : c.filter((p) => p !== f.path),
                        )
                      }
                      aria-label={f.path}
                    />
                    <code className={cn('text-xs', f.exists ? 'text-fg-faint' : 'text-fg')}>
                      {f.path}
                    </code>
                    {f.exists && <Badge>{t('templates.exists')}</Badge>}
                    {!f.exists && (
                      <button
                        type="button"
                        onClick={() => setPreview(preview === f.path ? null : f.path)}
                        className="ml-auto flex items-center gap-1 text-2xs text-fg-faint hover:text-fg"
                      >
                        <ChevronRight
                          size={11}
                          className={cn('transition-transform', preview === f.path && 'rotate-90')}
                        />
                        {t('templates.preview')}
                      </button>
                    )}
                  </div>
                  {preview === f.path && (
                    <pre className="scroll-thin max-h-56 overflow-auto border-t border-border bg-surface-2 px-2.5 py-2 font-mono text-2xs leading-relaxed whitespace-pre-wrap text-fg-muted">
                      {f.content}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-2xs leading-relaxed text-fg-faint">{t('templates.note')}</p>
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          disabled={busy || chosen.length === 0}
          onClick={() => void apply()}
          data-testid="templates-apply"
        >
          {t('templates.apply', { count: chosen.length })}
        </Button>
      </div>
    </Dialog>
  )
}
