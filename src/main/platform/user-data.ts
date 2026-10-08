import path from 'node:path'
import type { App } from 'electron'

/**
 * Dev builds keep their data apart from the stable build so Trellis can develop Trellis without
 * two instances writing the same ledgers (ADR-0011). TRELLIS_USER_DATA overrides both (tests).
 */
export function configureUserData(app: App): void {
  const override = process.env.TRELLIS_USER_DATA
  if (override) {
    app.setPath('userData', path.resolve(override))
  } else if (!app.isPackaged) {
    app.setPath('userData', path.join(app.getPath('appData'), 'Trellis-dev'))
  }
}
