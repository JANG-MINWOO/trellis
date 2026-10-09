// Minimal glob matching for project-relative, forward-slash paths. `**` crosses folders, `*` and
// `?` stay within one segment. Enough for risk areas and structure rules; no braces or classes.

const cache = new Map<string, RegExp>()

export function globToRegExp(glob: string): RegExp {
  let re = cache.get(glob)
  if (re) return re
  let out = '^'
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        // "**/" matches zero or more folders; a trailing "**" matches everything below.
        const slash = glob[i + 2] === '/'
        out += slash ? '(?:.*/)?' : '.*'
        i += slash ? 2 : 1
      } else {
        out += '[^/]*'
      }
    } else if (ch === '?') {
      out += '[^/]'
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  re = new RegExp(`${out}$`)
  cache.set(glob, re)
  return re
}

export function matchesGlob(path: string, glob: string): boolean {
  return globToRegExp(glob).test(path)
}

export function matchesAny(path: string, globs: readonly string[]): boolean {
  return globs.some((g) => matchesGlob(path, g))
}
