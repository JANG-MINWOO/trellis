import { type BrowserWindow, Notification } from 'electron'
import { translate } from '@shared/i18n'
import type { Settings, TrellisEvent } from '@shared/types'

const ASKS_FOR_INPUT = new Set(['permission_prompt', 'elicitation_dialog', 'agent_needs_input'])

/** OS notification when Claude finishes or needs the user while Trellis is in the background. */
export function notifyForEvent(
  event: TrellisEvent,
  projectName: string,
  settings: Settings,
  window: BrowserWindow | null,
): void {
  if (!settings.notifications.enabled || !Notification.isSupported()) return
  if (window && !window.isDestroyed() && window.isFocused()) return
  const lang = settings.language ?? 'en'
  let body: string | null = null
  if (event.kind === 'turn.stop') body = translate(lang, 'notify.turnDone')
  else if (event.kind === 'notification' && ASKS_FOR_INPUT.has(event.data.type))
    body = translate(lang, 'notify.needsInput')
  if (!body) return
  const n = new Notification({ title: projectName, body, silent: false })
  n.on('click', () => {
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    }
  })
  n.show()
}
