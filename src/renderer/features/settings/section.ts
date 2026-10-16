import type { Settings, SettingsPatch } from '@shared/types'

/** What every app-wide settings section gets from the dialog. */
export interface SectionProps {
  settings: Settings
  update: (patch: SettingsPatch) => Promise<void>
}
