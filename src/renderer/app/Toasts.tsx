import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { useStore } from '../state/store'

export function Toasts() {
  const { t } = useTranslation()
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed right-4 bottom-10 z-50 flex w-[340px] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-xs shadow-pop"
          role="status"
        >
          {toast.kind === 'error' ? (
            <CircleAlert size={15} className="shrink-0 text-danger" />
          ) : toast.kind === 'success' ? (
            <CircleCheck size={15} className="shrink-0 text-success" />
          ) : (
            <Info size={15} className="shrink-0 text-info" />
          )}
          <span className={cn('min-w-0 flex-1 leading-relaxed break-words text-fg')}>
            {toast.message}
          </span>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label={t('common.close')}
            className="shrink-0 text-fg-faint hover:text-fg"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
