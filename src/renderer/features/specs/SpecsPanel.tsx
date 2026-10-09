import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlaskConical, ListChecks } from 'lucide-react'
import { pendingBehaviors } from '@shared/specs'
import type { SpecList } from '@shared/types'
import { Badge, EmptyState, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { useActiveProject, useStore } from '../../state/store'
import { BehaviorCard } from './BehaviorCard'

/**
 * The behavior layer of the intent (ADR-0024): what the software must do and must never do, in
 * product words. Changes found in turns wait here for a human before they enter the spec files.
 */
export function SpecsPanel() {
  const { t } = useTranslation()
  const project = useActiveProject()
  const events = useStore((s) => (project ? s.events[project.id] : undefined))
  const fsTick = useStore((s) => (project ? (s.fsTick[project.id] ?? 0) : 0))
  const openFile = useStore((s) => s.openFile)
  const toast = useStore((s) => s.toast)
  const [specs, setSpecs] = useState<SpecList | null>(null)
  const projectId = project?.id
  const specsDir = project?.specsDir
  const pending = useMemo(() => (events ? pendingBehaviors(events) : []), [events])
  const resolvedCount = useMemo(
    () => events?.filter((e) => e.kind === 'behavior.resolved').length ?? 0,
    [events],
  )

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void api.specs.list(projectId).then((next) => {
      if (!cancelled) setSpecs(next)
    })
    return () => {
      cancelled = true
    }
  }, [projectId, specsDir, fsTick, resolvedCount])

  if (!project) return null
  const items = specs?.areas.flatMap((a) => a.items) ?? []

  const resolve = async (
    candidateId: string,
    answer: Parameters<typeof api.specs.resolve>[2],
  ): Promise<void> => {
    const result = await api.specs.resolve(project.id, candidateId, answer)
    if (!result.ok) toast('error', t('specs.resolveFailed', { message: result.message ?? '' }))
    else if (result.specPath) toast('success', t('specs.written', { path: result.specPath }))
  }

  return (
    <div data-testid="specs">
      <div className="space-y-2 p-3">
        <h3 className="text-2xs font-semibold tracking-wide text-fg-faint uppercase">
          {t('specs.pendingTitle')}{' '}
          {pending.length > 0 && <span className="text-warning">· {pending.length}</span>}
        </h3>
        {pending.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs leading-relaxed text-fg-faint">
            {t('specs.noPending')}
          </p>
        ) : (
          pending.map((b) => (
            <BehaviorCard
              key={b.candidateId}
              behavior={b}
              current={items.find((i) => i.id === b.targetId)}
              onResolve={(answer) => resolve(b.candidateId, answer)}
            />
          ))
        )}
      </div>

      <div className="border-t border-border p-3">
        {!specs ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : !project.specsDir ? (
          <EmptyState
            icon={<ListChecks size={22} />}
            title={t('specs.disabled')}
            className="py-8"
          />
        ) : specs.areas.length === 0 ? (
          <EmptyState
            icon={<ListChecks size={22} />}
            title={t('specs.empty')}
            body={t('specs.emptyHint', { dir: specs.dir })}
            className="py-8"
          />
        ) : (
          <div className="space-y-4">
            {specs.areas.map((area) => (
              <section key={area.path}>
                <button
                  type="button"
                  onClick={() => void openFile(project.id, area.path)}
                  className="flex w-full items-baseline justify-between gap-2 text-left"
                  title={area.path}
                >
                  <span className="text-xs font-semibold text-fg">{area.area}</span>
                  <span className="truncate text-2xs text-fg-faint">{area.path}</span>
                </button>
                <ul className="mt-1.5 space-y-1">
                  {area.items.map((item) => {
                    const tests = specs.tests[item.id] ?? []
                    return (
                      <li
                        key={item.id}
                        className="flex gap-2 text-xs leading-relaxed"
                        data-testid="spec-item"
                      >
                        <span className="mt-px shrink-0 font-mono text-2xs text-fg-faint">
                          {item.id}
                        </span>
                        <span className="min-w-0 flex-1 text-fg-muted">{item.text}</span>
                        <span className="shrink-0" title={tests.join('\n')}>
                          {tests.length > 0 ? (
                            <Badge tone="accent">
                              <FlaskConical size={10} className="mr-1" />
                              {tests.length}
                            </Badge>
                          ) : (
                            <Badge>{t('specs.noTest')}</Badge>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
            <p className="text-2xs leading-relaxed text-fg-faint">{t('specs.testHint')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
