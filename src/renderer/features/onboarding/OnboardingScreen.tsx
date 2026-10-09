import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleCheck, CircleX, FolderPlus, Sprout } from 'lucide-react'
import type { EnvironmentStatus, Language, PermissionMode, ToolStatus } from '@shared/types'
import { Button, Select, Spinner } from '../../components/ui'
import { setLanguage } from '../../i18n'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { shortenHome } from '../../lib/format'
import { useStore } from '../../state/store'
import { PERMISSION_MODES } from '../terminal'

/** First run: pick a language, check that Claude Code and git are there, add a first folder. */
export function OnboardingScreen() {
  const { t, i18n } = useTranslation()
  const appInfo = useStore((s) => s.appInfo)
  const projects = useStore((s) => s.projects)
  const update = useStore((s) => s.updateSettings)
  const addProject = useStore((s) => s.addProject)
  const [lang, setLang] = useState<Language>(i18n.language === 'ko' ? 'ko' : 'en')
  const [step, setStep] = useState<'language' | 'setup'>('language')
  const [env, setEnv] = useState<EnvironmentStatus | null>(null)
  const [permission, setPermission] = useState<PermissionMode>('claude-default')

  useEffect(() => setLanguage(lang), [lang])

  const check = (): void => {
    setEnv(null)
    void api.environment.check().then(setEnv)
  }
  const goToSetup = (): void => {
    setStep('setup')
    check()
  }

  const finish = (): Promise<void> =>
    update({ language: lang, claude: { permissionMode: permission } })

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-8">
      <div className="w-[520px] max-w-full">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Sprout size={24} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-fg">{t('onboarding.title')}</h1>
            <p className="text-sm text-fg-muted">{t('onboarding.subtitle')}</p>
          </div>
        </div>

        {step === 'language' && (
          <section>
            <h2 className="text-sm font-semibold text-fg">{t('onboarding.languageTitle')}</h2>
            <p className="mt-1 text-xs text-fg-muted">{t('onboarding.languageHint')}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {(
                [
                  ['ko', '한국어', 'Korean'],
                  ['en', 'English', '영어'],
                ] as const
              ).map(([value, label, sub]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLang(value)}
                  className={cn(
                    'rounded-xl border px-4 py-4 text-left transition-colors',
                    lang === value
                      ? 'border-accent bg-accent-soft'
                      : 'border-border bg-surface hover:bg-surface-2',
                  )}
                >
                  <div className="text-base font-semibold text-fg">{label}</div>
                  <div className="text-xs text-fg-faint">{sub}</div>
                </button>
              ))}
            </div>
            <div className="mt-8 flex justify-end">
              <Button variant="primary" onClick={goToSetup} data-testid="onboarding-next">
                {t('onboarding.next')}
              </Button>
            </div>
          </section>
        )}

        {step === 'setup' && (
          <section>
            <h2 className="text-sm font-semibold text-fg">{t('onboarding.envTitle')}</h2>
            <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
              <ToolRow name="Claude Code" status={env?.claude} help={t('onboarding.claudeHelp')} />
              <ToolRow name="git" status={env?.git} help={t('onboarding.gitHelp')} />
            </div>
            {env && !env.shellEnvResolved && appInfo?.platform !== 'win32' && (
              <p className="mt-2 text-xs text-warning">{t('onboarding.shellEnvWarn')}</p>
            )}
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="ghost" onClick={check}>
                {t('onboarding.recheck')}
              </Button>
            </div>

            <h2 className="mt-6 text-sm font-semibold text-fg">
              {t('onboarding.permissionTitle')}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-fg-muted">
              {t('onboarding.permissionHint')}
            </p>
            <div className="mt-3">
              <Select
                value={permission}
                onChange={(e) => setPermission(e.target.value as PermissionMode)}
              >
                {PERMISSION_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`permission.${mode}.label`)}
                  </option>
                ))}
              </Select>
              <p
                className={cn(
                  'mt-1.5 text-2xs leading-relaxed',
                  permission === 'bypass' ? 'text-danger' : 'text-fg-faint',
                )}
              >
                {t(`permission.${permission}.hint`)}
              </p>
            </div>

            <h2 className="mt-6 text-sm font-semibold text-fg">{t('onboarding.projectTitle')}</h2>
            <p className="mt-1 text-xs leading-relaxed text-fg-muted">
              {t('onboarding.projectHint')}
            </p>
            <div className="mt-3 space-y-2">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                >
                  <CircleCheck size={15} className="text-success" />
                  <span className="max-w-[45%] shrink-0 truncate font-medium text-fg">
                    {p.name}
                  </span>
                  <span className="min-w-0 truncate text-xs text-fg-faint">
                    {shortenHome(p.path)}
                  </span>
                </div>
              ))}
              <Button onClick={() => void addProject()} data-testid="onboarding-add-project">
                <FolderPlus size={14} />
                {t('projects.add')}
              </Button>
            </div>

            <div className="mt-8 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep('language')}>
                {t('onboarding.back')}
              </Button>
              <Button
                variant="primary"
                onClick={() => void finish()}
                data-testid="onboarding-finish"
              >
                {t('onboarding.start')}
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function ToolRow({
  name,
  status,
  help,
}: {
  name: string
  status: ToolStatus | undefined
  help: string
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="pt-0.5">
        {!status ? (
          <Spinner size={16} />
        ) : status.found ? (
          <CircleCheck size={16} className="text-success" />
        ) : (
          <CircleX size={16} className="text-danger" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium text-fg">{name}</span>
          <span className="truncate text-xs text-fg-faint">
            {!status
              ? t('onboarding.checking')
              : status.found
                ? (status.version ?? t('onboarding.found'))
                : t('onboarding.notFound')}
          </span>
        </div>
        {status?.path && (
          <div className="truncate font-mono text-2xs text-fg-faint">
            {shortenHome(status.path)}
          </div>
        )}
        {status && !status.found && (
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">{help}</p>
        )}
      </div>
    </div>
  )
}
