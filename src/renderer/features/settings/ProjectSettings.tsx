import { useTranslation } from 'react-i18next'
import type { Language, Project } from '@shared/types'
import { DEFAULT_RISK_AREAS } from '@shared/defaults'
import { Button, FieldRow, Select, Switch } from '../../components/ui'
import { api } from '../../lib/api'
import { useStore } from '../../state/store'
import { CommitInput, CommitLines } from './CommitInput'

export function ProjectSettings({ project }: { project: Project }) {
  const { t } = useTranslation()
  const appInfo = useStore((s) => s.appInfo)
  const refreshProjects = useStore((s) => s.refreshProjects)

  const updateProject = async (patch: Parameters<typeof api.projects.update>[1]): Promise<void> => {
    await api.projects.update(project.id, patch)
    await refreshProjects()
  }

  return (
    <>
      <FieldRow label={t('settings.projectName')}>
        <CommitInput value={project.name} onCommit={(name) => void updateProject({ name })} />
      </FieldRow>
      <FieldRow label={t('settings.projectPath')}>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-fg-muted">
            {project.path}
          </code>
          <Button size="sm" onClick={() => void api.projects.reveal(project.id)}>
            {t(appInfo?.platform === 'darwin' ? 'projects.revealMac' : 'projects.reveal')}
          </Button>
        </div>
      </FieldRow>
      <FieldRow label={t('settings.decisionsDir')} hint={t('settings.decisionsDirHint')}>
        <CommitInput
          value={project.decisionsDir}
          placeholder="docs/decisions"
          onCommit={(decisionsDir) => void updateProject({ decisionsDir })}
        />
      </FieldRow>
      <FieldRow label={t('settings.specsDir')} hint={t('settings.specsDirHint')}>
        <CommitInput
          value={project.specsDir}
          placeholder="docs/specs"
          onCommit={(specsDir) => void updateProject({ specsDir })}
        />
      </FieldRow>
      <FieldRow
        label={t('settings.analysisEnabled')}
        hint={t('settings.analysisEnabledHint')}
        inline
      >
        <Switch
          checked={project.analysisEnabled}
          onCheckedChange={(analysisEnabled) => void updateProject({ analysisEnabled })}
          label={t('settings.analysisEnabled')}
        />
      </FieldRow>
      <FieldRow
        label={t('settings.riskAreas')}
        hint={
          <>
            {t('settings.riskAreasHint')}{' '}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-fg"
              onClick={() => void updateProject({ riskAreas: [...DEFAULT_RISK_AREAS] })}
            >
              {t('settings.riskAreasReset')}
            </button>
          </>
        }
      >
        <CommitLines
          value={project.riskAreas}
          onCommit={(riskAreas) => void updateProject({ riskAreas })}
        />
      </FieldRow>
      <FieldRow label={t('settings.recordLanguage')} hint={t('settings.recordLanguageHint')} inline>
        <div className="w-44">
          <Select
            value={project.recordLanguage ?? 'app'}
            onChange={(e) =>
              void updateProject({
                recordLanguage: e.target.value === 'app' ? null : (e.target.value as Language),
              })
            }
          >
            <option value="app">{t('settings.followApp')}</option>
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </Select>
        </div>
      </FieldRow>
    </>
  )
}
