import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileCog, Snowflake } from 'lucide-react'
import { violationText } from '@shared/rules'
import type { RuleId, RulesReport, Violation } from '@shared/types'
import { Badge, Button, Notice } from '../../components/ui'
import { cn } from '../../lib/cn'
import { splitPath } from '../../lib/format'
import { SectionTitle } from './SectionTitle'

const ORDER: RuleId[] = ['boundary', 'cycle', 'max-lines', 'duplicate', 'folder-size']
const LIST_LIMIT = 8

/** Structure rules: what breaks them now, beyond the frozen baseline (M3). */
export function RulesSection({
  rules,
  onOpen,
  onFreeze,
  onTemplates,
}: {
  rules: RulesReport
  onOpen: (path: string) => void
  onFreeze: () => Promise<void>
  onTemplates: () => void
}) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const [expanded, setExpanded] = useState<RuleId | null>(null)
  const groups = ORDER.map((rule) => ({
    rule,
    items: rules.newViolations.filter((v) => v.rule === rule),
  })).filter((g) => g.items.length > 0)

  const describe = (v: Violation): string => {
    const { key, vars } = violationText(v, true)
    return t(key, vars)
  }

  return (
    <section data-testid="rules">
      <SectionTitle
        action={
          !rules.hasConfig && (
            <Button size="xs" variant="ghost" onClick={onTemplates} data-testid="templates-open">
              <FileCog size={11} />
              {t('rules.makeFiles')}
            </Button>
          )
        }
      >
        {t('rules.title')}
      </SectionTitle>
      <p className="text-2xs leading-relaxed text-fg-faint">
        {rules.hasConfig ? t('rules.usingFile') : t('rules.usingDefaults')}
        {' · '}
        {rules.hasBaseline
          ? t('rules.frozen', { count: rules.frozenCount })
          : t('rules.noBaseline')}
      </p>
      {rules.configError && (
        <Notice tone="warning" className="mt-2">
          {t('rules.configError', { message: rules.configError })}
        </Notice>
      )}

      {groups.length === 0 ? (
        <p className="mt-2 rounded-md border border-dashed border-border px-3 py-2.5 text-xs text-fg-faint">
          {rules.hasBaseline ? t('rules.cleanSinceBaseline') : t('rules.clean')}
        </p>
      ) : (
        <div className="mt-2 space-y-2.5">
          {groups.map(({ rule, items }) => {
            const shown = expanded === rule ? items : items.slice(0, LIST_LIMIT)
            return (
              <div key={rule}>
                <div className="flex items-center gap-1.5 text-xs font-medium text-fg">
                  {t(`rules.name.${rule}`)}
                  <Badge tone={rule === 'boundary' || rule === 'cycle' ? 'danger' : 'warning'}>
                    {items.length}
                  </Badge>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {shown.map((v) => {
                    const [name, dir] = splitPath(v.path)
                    return (
                      <li key={v.fingerprint}>
                        <button
                          type="button"
                          onClick={() => rule !== 'folder-size' && onOpen(v.path)}
                          className={cn(
                            'flex w-full min-w-0 items-baseline gap-1.5 rounded px-1.5 py-0.5 text-left text-xs',
                            rule !== 'folder-size' && 'hover:bg-surface-2',
                          )}
                          title={
                            [v.path, ...v.related].join('\n') + (v.message ? `\n${v.message}` : '')
                          }
                          data-testid="violation"
                        >
                          <span className="shrink-0 text-fg">
                            {rule === 'folder-size' ? v.path : name}
                          </span>
                          {rule !== 'folder-size' && (
                            <span className="min-w-0 truncate text-2xs text-fg-faint">{dir}</span>
                          )}
                          <span className="ml-auto shrink-0 text-2xs text-fg-muted">
                            {v.message || describe(v)}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {items.length > LIST_LIMIT && expanded !== rule && (
                  <button
                    type="button"
                    onClick={() => setExpanded(rule)}
                    className="mt-0.5 px-1.5 text-2xs text-fg-faint hover:text-fg"
                  >
                    {t('rules.showAll', { count: items.length })}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {rules.newViolations.length > 0 && (
        <div className="mt-3 rounded-md bg-surface-2 px-2.5 py-2 text-2xs leading-relaxed text-fg-muted">
          {confirming ? (
            <>
              <p>
                {t('rules.freezeConfirm', {
                  count: rules.newViolations.length + rules.frozenCount,
                })}
              </p>
              <div className="mt-1.5 flex justify-end gap-1.5">
                <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  size="xs"
                  variant="primary"
                  onClick={() => void onFreeze().finally(() => setConfirming(false))}
                  data-testid="freeze-confirm"
                >
                  {t('rules.freeze')}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span>{t('rules.freezeHint')}</span>
              <Button size="xs" onClick={() => setConfirming(true)} data-testid="freeze">
                <Snowflake size={11} />
                {t('rules.freeze')}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
