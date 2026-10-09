// Helpers for images on the clipboard and files dropped from Finder/Explorer.
import { quotePathForTerminal } from '@shared/cli-args'
import type { AppInfo } from '@shared/types'
import { api } from './api'

/** True when the clipboard holds an image and no text (copying text from a page keeps text). */
export function clipboardHasOnlyImage(data: DataTransfer | null): boolean {
  if (!data) return false
  const hasImage = [...data.items].some(
    (item) => item.kind === 'file' && item.type.startsWith('image/'),
  )
  return hasImage && !data.types.includes('text/plain')
}

/** Paths of dropped files, escaped the way terminals insert them so the agent can parse them. */
export function droppedPaths(
  data: DataTransfer | null,
  platform: AppInfo['platform'] | undefined,
): string[] {
  if (!data) return []
  return [...data.files]
    .map((file) => api.files.pathForFile(file))
    .filter(Boolean)
    .map((path) => quotePathForTerminal(path, platform ?? 'darwin'))
}

export const hasFiles = (data: DataTransfer | null): boolean =>
  !!data && [...data.types].includes('Files')
