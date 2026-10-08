import { EventEmitter } from 'node:events'
import { applySettingsPatch, normalizeSettings } from '@shared/settings'
import type { Settings, SettingsPatch } from '@shared/types'
import { readJson, writeJsonAtomic } from '../../lib/json-file'

export class SettingsStore extends EventEmitter<{ change: [Settings] }> {
  private constructor(
    private readonly file: string,
    private settings: Settings,
  ) {
    super()
  }

  static async load(file: string): Promise<SettingsStore> {
    const raw = await readJson<unknown>(file, null)
    // No file yet → first run: language must stay unset so onboarding asks for it.
    const settings = raw === null ? normalizeSettings({ language: null }) : normalizeSettings(raw)
    return new SettingsStore(file, settings)
  }

  get(): Settings {
    return this.settings
  }

  async update(patch: SettingsPatch): Promise<Settings> {
    this.settings = applySettingsPatch(this.settings, patch)
    await writeJsonAtomic(this.file, this.settings)
    this.emit('change', this.settings)
    return this.settings
  }
}
