import { useTranslation } from 'react-i18next'
import { ShieldAlert } from 'lucide-react'
import { PERMISSION_MODES } from '@shared/settings'
import type { PermissionMode } from '@shared/types'
import { Select } from '../../components/ui'
import { cn } from '../../lib/cn'

/** How Claude asks for permission (ADR-0017). `withHint` explains the choice below the select. */
export function PermissionSelect({
  value,
  onChange,
  withHint = false,
  testId,
}: {
  value: PermissionMode
  onChange: (mode: PermissionMode) => void
  withHint?: boolean
  testId?: string
}) {
  const { t } = useTranslation()
  return (
    <>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value as PermissionMode)}
        data-testid={testId}
      >
        {PERMISSION_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {t(`permission.${mode}.label`)}
          </option>
        ))}
      </Select>
      {withHint && (
        <p
          className={cn(
            'mt-1.5 flex gap-1.5 text-2xs leading-relaxed',
            value === 'bypass' ? 'text-danger' : 'text-fg-faint',
          )}
        >
          {value === 'bypass' && <ShieldAlert size={12} className="mt-px shrink-0" />}
          {t(`permission.${value}.hint`)}
        </p>
      )}
    </>
  )
}
