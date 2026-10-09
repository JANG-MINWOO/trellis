import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, RotateCcw, ShieldAlert } from 'lucide-react'
import type { PermissionMode } from '@shared/types'
import { Button, Select } from '../../components/ui'
import { cn } from '../../lib/cn'
import { useStore } from '../../state/store'

export const PERMISSION_MODES: PermissionMode[] = [
  'claude-default',
  'manual',
  'acceptEdits',
  'auto',
  'plan',
  'bypass',
]

/** Choose how Claude asks for permission, then continue the last conversation or start a new one. */
export function LaunchPanel({
  projectId,
  terminalId,
  newTab,
  onStarted,
  className,
}: {
  projectId: string
  /** Restart this tab. */
  terminalId?: string
  /** Start in an additional tab. */
  newTab?: boolean
  onStarted?: () => void
  className?: string
}) {
  const { t } = useTranslation()
  // Restarting a tab keeps the permissions it ran with; new launches start from the default.
  const defaultPermission = useStore(
    (s) =>
      (terminalId ? s.terminals[terminalId]?.permissionMode : null) ??
      s.settings?.claude.permissionMode ??
      'claude-default',
  )
  const startTerminal = useStore((s) => s.startTerminal)
  const otherRunning = useStore((s) =>
    Object.values(s.terminals).some(
      (x) => x.projectId === projectId && x.kind === 'claude' && x.running && x.id !== terminalId,
    ),
  )
  const [permission, setPermission] = useState<PermissionMode>(defaultPermission)

  const start = (mode: 'continue' | 'new'): void => {
    void startTerminal(projectId, 'claude', {
      mode,
      permissionMode: permission,
      terminalId,
      newTab,
    })
    onStarted?.()
  }

  return (
    <div className={cn('w-full max-w-[380px]', className)}>
      <label className="mb-1.5 block text-xs font-medium text-fg-muted">
        {t('launch.permission')}
      </label>
      <Select
        value={permission}
        onChange={(e) => setPermission(e.target.value as PermissionMode)}
        data-testid="permission-select"
      >
        {PERMISSION_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {t(`permission.${mode}.label`)}
          </option>
        ))}
      </Select>
      <p
        className={cn(
          'mt-1.5 flex gap-1.5 text-2xs leading-relaxed',
          permission === 'bypass' ? 'text-danger' : 'text-fg-faint',
        )}
      >
        {permission === 'bypass' && <ShieldAlert size={12} className="mt-px shrink-0" />}
        {t(`permission.${permission}.hint`)}
      </p>
      <div className="mt-4 flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          disabled={otherRunning}
          title={otherRunning ? t('launch.continueBusy') : undefined}
          onClick={() => start('continue')}
          data-testid="launch-continue"
        >
          <RotateCcw size={14} />
          {t('terminal.continue')}
        </Button>
        <Button className="flex-1" onClick={() => start('new')} data-testid="launch-new">
          <Play size={14} />
          {t('terminal.newConversation')}
        </Button>
      </div>
      {otherRunning && <p className="mt-2 text-2xs text-fg-faint">{t('launch.continueBusy')}</p>}
    </div>
  )
}
