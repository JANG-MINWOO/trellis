import { spawn } from 'node:child_process'
import { shell } from 'electron'
import type { Settings } from '@shared/types'
import { resolveEditorLaunch } from '../../platform/editors'
import { resolveInsideProject } from '../../platform/paths'

/**
 * message is 'ask' when the user has not picked an editor yet (the UI then asks once), and
 * 'editor-missing' when the chosen editor is no longer installed.
 */
export async function openInEditor(
  root: string,
  relPath: string,
  settings: Settings,
  env: NodeJS.ProcessEnv,
): Promise<{ ok: boolean; message?: string }> {
  const file = resolveInsideProject(root, relPath)
  if (!file) return { ok: false, message: 'outside-project' }
  const launch = resolveEditorLaunch(settings.editor, env, root, file)
  switch (launch.kind) {
    case 'ask':
      return { ok: false, message: 'ask' }
    case 'missing':
      return { ok: false, message: 'editor-missing' }
    case 'reveal':
      shell.showItemInFolder(file)
      return { ok: true }
    case 'system': {
      const error = await shell.openPath(file)
      return error ? { ok: false, message: error } : { ok: true }
    }
    case 'process':
      return new Promise((resolve) => {
        try {
          const child = spawn(launch.file, launch.args, {
            env,
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
          })
          child.once('error', (e) => resolve({ ok: false, message: e.message }))
          child.once('spawn', () => {
            child.unref()
            resolve({ ok: true })
          })
        } catch (error) {
          resolve({ ok: false, message: (error as Error).message })
        }
      })
  }
}
