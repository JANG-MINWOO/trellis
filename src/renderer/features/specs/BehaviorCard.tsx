import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PendingBehavior } from '@shared/specs'
import type { SpecItem } from '@shared/types'
import { Badge, Button, Input, Textarea } from '../../components/ui'
import { cn } from '../../lib/cn'

const OP_TONE = { add: 'accent', change: 'warning', remove: 'danger' } as const

/** A behavior change put to the human, editable before it goes into the spec. */
export function BehaviorCard({
  behavior,
  current,
  onResolve,
}: {
  behavior: PendingBehavior
  /** The spec item being changed or removed, if any. */
  current: SpecItem | undefined
  onResolve: (answer: {
    resolution: 'accepted' | 'dismissed'
    statement: string
    area: string
  }) => Promise<void>
}) {
  const { t } = useTranslation()
  const [statement, setStatement] = useState(behavior.statement)
  const [area, setArea] = useState(behavior.area)
  const [busy, setBusy] = useState(false)

  const resolve = async (resolution: 'accepted' | 'dismissed'): Promise<void> => {
    setBusy(true)
    try {
      await onResolve({ resolution, statement, area })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="rounded-lg border border-border bg-surface px-3 py-2.5"
      data-testid="behavior-card"
    >
      <div className="flex flex-wrap items-center gap-1.5 text-2xs text-fg-faint">
        <Badge tone={OP_TONE[behavior.op]}>{t(`specs.op.${behavior.op}`)}</Badge>
        <Badge>{t(`specs.kind.${behavior.kind}`)}</Badge>
        <span>
          {behavior.source === 'intent' ? t('specs.fromIntent') : t('specs.fromAnalysis')}
        </span>
      </div>
      {current && (
        <p
          className={cn('mt-1.5 text-xs text-fg-faint', behavior.op === 'remove' && 'line-through')}
        >
          <span className="font-mono text-2xs">[{current.id}]</span> {current.text}
        </p>
      )}
      {behavior.op !== 'remove' && (
        <Textarea
          rows={2}
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          className="mt-2 text-xs"
          data-testid="behavior-statement"
        />
      )}
      <label className="mt-2 flex items-center gap-2 text-2xs text-fg-faint">
        {t('specs.area')}
        <Input
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="h-7 flex-1 text-xs"
        />
      </label>
      <div className="mt-2 flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void resolve('dismissed')}>
          {t('specs.dismiss')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={busy || (behavior.op !== 'remove' && !statement.trim())}
          onClick={() => void resolve('accepted')}
          data-testid="behavior-accept"
        >
          {t('specs.accept')}
        </Button>
      </div>
    </div>
  )
}
