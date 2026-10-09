import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ShieldAlert, Sparkles } from 'lucide-react'
import type { PendingDecision } from '@shared/decisions'
import { Badge, Button, Textarea } from '../../components/ui'
import { cn } from '../../lib/cn'
import { relativeTime, splitPath } from '../../lib/format'

const RISK_TONE = { high: 'danger', medium: 'warning', low: 'neutral' } as const

/**
 * A decision the agent made, put to the human: the consequences are shown up front (anyone can
 * judge those), and the reason is asked in the human's own words — the agent's guess is only a
 * placeholder, used as the reason only if the human explicitly says so.
 */
export function DecisionCard({
  decision,
  recordsEnabled,
  onResolve,
  onOpenFile,
}: {
  decision: PendingDecision
  recordsEnabled: boolean
  onResolve: (answer: {
    resolution: 'accepted' | 'dismissed'
    reason: string
    reasonFromGuess: boolean
  }) => Promise<void>
  onOpenFile: (path: string) => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState(false)
  const [busy, setBusy] = useState(false)

  const resolve = async (
    resolution: 'accepted' | 'dismissed',
    fromGuess = false,
  ): Promise<void> => {
    setBusy(true)
    try {
      await onResolve({
        resolution,
        reason: fromGuess ? decision.whyGuess : reason.trim(),
        reasonFromGuess: fromGuess,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-surface px-3 py-2.5',
        decision.risk === 'high' ? 'border-danger/40' : 'border-border',
      )}
      data-testid="decision-card"
    >
      <div className="flex flex-wrap items-center gap-1.5 text-2xs text-fg-faint">
        <Badge tone={RISK_TONE[decision.risk]}>{t(`decisions.risk.${decision.risk}`)}</Badge>
        <Badge>{t(`decisions.kind.${decision.kind}`)}</Badge>
        <span className="flex items-center gap-1">
          {decision.source === 'risk-area' ? <ShieldAlert size={11} /> : <Sparkles size={11} />}
          {decision.source === 'risk-area'
            ? t('decisions.fromRiskArea')
            : t('decisions.fromAnalysis')}
        </span>
        <span className="ml-auto">{relativeTime(decision.ts)}</span>
      </div>
      <h4 className="mt-1.5 text-[13px] leading-snug font-semibold text-fg">{decision.title}</h4>
      {decision.what && (
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">{decision.what}</p>
      )}
      {decision.consequences && (
        <div className="mt-2 rounded-md bg-surface-2 px-2.5 py-1.5">
          <div className="text-2xs font-semibold text-fg-muted">{t('decisions.consequences')}</div>
          <p className="mt-0.5 text-xs leading-relaxed text-fg">{decision.consequences}</p>
        </div>
      )}

      {(decision.whyGuess || decision.alternatives || decision.files.length > 0) && (
        <button
          type="button"
          onClick={() => setDetails((v) => !v)}
          className="mt-2 flex items-center gap-1 text-2xs font-medium text-fg-faint hover:text-fg"
        >
          <ChevronRight size={11} className={cn('transition-transform', details && 'rotate-90')} />
          {t('decisions.details')}
        </button>
      )}
      {details && (
        <div className="mt-1.5 space-y-1.5 text-xs leading-relaxed">
          {decision.whyGuess && (
            <p className="text-fg-muted">
              <span className="font-medium text-fg-faint">{t('decisions.whyGuess')} </span>
              {decision.whyGuess}
            </p>
          )}
          {decision.alternatives && (
            <p className="text-fg-muted">
              <span className="font-medium text-fg-faint">{t('decisions.alternatives')} </span>
              {decision.alternatives}
            </p>
          )}
          {decision.files.length > 0 && (
            <ul className="space-y-0.5">
              {decision.files.map((f) => {
                const [name, dir] = splitPath(f)
                return (
                  <li key={f}>
                    <button
                      type="button"
                      onClick={() => onOpenFile(f)}
                      className="flex w-full items-baseline gap-1.5 rounded px-1 text-left hover:bg-surface-2"
                      title={f}
                    >
                      <span className="text-fg">{name}</span>
                      <span className="truncate text-2xs text-fg-faint">{dir}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      <Textarea
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t('decisions.reasonPlaceholder')}
        className="mt-2.5 text-xs"
        data-testid="decision-reason"
      />
      {!recordsEnabled && (
        <p className="mt-1 text-2xs text-fg-faint">{t('decisions.noRecordFiles')}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
        {decision.whyGuess && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void resolve('accepted', true)}
            className="mr-auto text-2xs text-fg-faint underline-offset-2 hover:text-fg hover:underline"
          >
            {t('decisions.useGuess')}
          </button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void resolve('dismissed')}
          data-testid="decision-dismiss"
        >
          {t('decisions.dismiss')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={busy || !reason.trim()}
          onClick={() => void resolve('accepted')}
          data-testid="decision-accept"
        >
          {t('decisions.record')}
        </Button>
      </div>
    </div>
  )
}
