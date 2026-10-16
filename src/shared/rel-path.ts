// Project-relative paths use forward slashes on every OS; they become OS paths only at the file
// system boundary (path.join(root, ...rel.split('/'))).

/** "docs/specs/" + "auth.md" → "docs/specs/auth.md" ("" + name → name). */
export function joinRel(dir: string, name: string): string {
  const d = dir.replace(/\/+$/, '')
  return d ? `${d}/${name}` : name
}

/** "docs/specs" → "docs/specs/" for startsWith checks; null when the folder is not set. */
export function dirPrefix(dir: string): string | null {
  const d = dir.replace(/\/+$/, '')
  return d ? `${d}/` : null
}
