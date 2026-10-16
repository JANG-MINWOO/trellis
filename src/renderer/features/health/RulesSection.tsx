import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileCog, Snowflake } from 'lucide-react'
import { violationText } from '@shared/rules'
import type { RuleId, RulesReport, Violation } from '@shared/types'
import { Badge, Button, DashedNote, Notice, PathRow, SectionLabel } from '../../components/ui'

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
      <SectionLabel
        bare
        className="mt-5 mb-2"
        actions={
          !rules.hasConfig && (
            <Button size="xs" variant="ghost" onClick={onTemplates} data-testid="templates-open">
              <FileCog size={11} />
              {t('rules.makeFiles')}
            </Button>
          )
        }
      >
        {t('rules.title')}
      </SectionLabel>
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
        <DashedNote className="mt-2 py-2.5">
          {rules.hasBaseline ? t('rules.cleanSinceBaseline') : t('rules.clean')}
        </DashedNote>
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
                  {shown.map((v) => (
                    <li key={v.fingerprint}>
                      <PathRow
                        path={v.path}
                        whole={rule === 'folder-size'}
                        onOpen={rule === 'folder-size' ? undefined : () => onOpen(v.path)}
                        title={
                          [v.path, ...v.related].join('\n') + (v.message ? `\n${v.message}` : '')
                        }
                        trailing={<span className="text-fg-muted">{v.message || describe(v)}</span>}
                        testId="violation"
                      />
                    </li>
                  ))}
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
