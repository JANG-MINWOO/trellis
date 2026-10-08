import path from 'node:path'

/** Absolute or root-relative path → forward-slash path relative to root, or null when outside. */
export function toProjectRelative(root: string, target: string): string | null {
  const abs = path.isAbsolute(target) ? target : path.join(root, target)
  const rel = path.relative(root, abs)
  if (rel === '') return ''
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return rel.split(path.sep).join('/')
}

/** Forward-slash project-relative path → absolute path, refusing to escape the root. */
export function resolveInsideProject(root: string, rel: string): string | null {
  const abs = path.resolve(root, ...rel.split('/').filter(Boolean))
  return toProjectRelative(root, abs) === null ? null : abs
}
