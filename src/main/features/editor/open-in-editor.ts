import { spawn } from 'node:child_process'
import { shell } from 'electron'
import type { Settings } from '@shared/types'
import { resolveEditorLaunch } from '../../platform/editors'
import { resolveInsideProject } from '../../platform/paths'

export async function openInEditor(
  root: string,
  relPath: string,
  settings: Settings,
  env: NodeJS.ProcessEnv,
): Promise<{ ok: boolean; message?: string }> {
  const file = resolveInsideProject(root, relPath)
  if (!file) return { ok: false, message: 'outside-project' }
  const launch = resolveEditorLaunch(
    settings.editor.kind,
    settings.editor.customPath,
    env,
    root,
    file,
  ) ?? { kind: 'system' as const }
  if (launch.kind === 'system') {
    const error = await shell.openPath(file)
    return error ? { ok: false, message: error } : { ok: true }
  }
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
