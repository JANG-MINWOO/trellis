import type { ChangeEntry, ChangeStatus } from '@shared/types'

interface NumStat {
  additions: number
  deletions: number
  binary: boolean
}

/** Parses `git diff-tree -r -z --numstat -M`. Keyed by the new path. */
export function parseNumstatZ(output: string): Map<string, NumStat> {
  const result = new Map<string, NumStat>()
  const tokens = output.split('\0')
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (!token) continue
    const match = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(token)
    if (!match) continue
    const [, add, del, inlinePath] = match
    let path = inlinePath!
    if (path === '') {
      // Rename/copy: "<add>\t<del>\t\0<old>\0<new>\0"
      i += 2
      path = tokens[i] ?? ''
    }
    if (!path) continue
    const binary = add === '-' || del === '-'
    result.set(path, {
      additions: binary ? 0 : Number(add),
      deletions: binary ? 0 : Number(del),
      binary,
    })
  }
  return result
}

/** Parses `git diff-tree -r -z --name-status -M`. */
export function parseNameStatusZ(
  output: string,
): { status: ChangeStatus; path: string; oldPath: string | null }[] {
  const tokens = output.split('\0')
  const out: { status: ChangeStatus; path: string; oldPath: string | null }[] = []
  for (let i = 0; i < tokens.length; i++) {
    const code = tokens[i]
    if (!code) continue
    const letter = code[0]!
    if (letter === 'R' || letter === 'C') {
      const oldPath = tokens[++i] ?? ''
      const path = tokens[++i] ?? ''
      out.push({ status: letter === 'C' ? 'A' : 'R', path, oldPath })
    } else {
      const path = tokens[++i] ?? ''
      const status: ChangeStatus = letter === 'A' || letter === 'D' || letter === 'T' ? letter : 'M'
      out.push({ status, path, oldPath: null })
    }
  }
  return out
}

/** Joins both outputs and makes paths relative to the project inside the repository. */
export function combineChanges(nameStatus: string, numstat: string, prefix: string): ChangeEntry[] {
  const stats = parseNumstatZ(numstat)
  const strip = (p: string): string | null => {
    if (!prefix) return p
    return p.startsWith(prefix + '/') ? p.slice(prefix.length + 1) : null
  }
  const entries: ChangeEntry[] = []
  for (const item of parseNameStatusZ(nameStatus)) {
    const path = strip(item.path)
    if (path === null) continue
    const stat = stats.get(item.path) ?? { additions: 0, deletions: 0, binary: false }
    entries.push({
      path,
      oldPath: item.oldPath ? (strip(item.oldPath) ?? item.oldPath) : null,
      status: item.status,
      ...stat,
    })
  }
  return entries
}
