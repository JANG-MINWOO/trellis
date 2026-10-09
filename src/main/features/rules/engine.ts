// The rules engine (M3, ADR-0026): language-agnostic checks over a list of files and their facts.
// Pure — the caller decides where files come from (a git tree, the working folder).
import { posix } from 'node:path'
import { matchesAny, matchesGlob } from '@shared/glob'
import type { DriftItem, HealthMetrics, Violation } from '@shared/types'
import type { RulesConfig } from './config'
import { isCode, langOf, windowKey, type FileFacts } from './facts'
import type { Resolve } from './resolve'

export interface AnalyzedFile {
  path: string
  size: number
  /** Null for binary or very large files. */
  facts: FileFacts | null
}

export interface Analysis {
  violations: Violation[]
  drift: DriftItem[]
  metrics: HealthMetrics
  /** Every code file over the line limit (the metrics keep only the top few). */
  overThreshold: { path: string; lines: number }[]
}

const MAX_DUP_FILES_PER_WINDOW = 5
const MAX_DUP_PAIRS = 200

const folderOf = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.')

export function analyze(
  all: readonly AnalyzedFile[],
  config: RulesConfig,
  resolve: Resolve,
  isLivingDoc: (path: string) => boolean,
): Analysis {
  const files = all.filter((f) => !matchesAny(f.path, config.exclude))
  const text = files.filter((f) => f.facts)
  const code = text.filter((f) => isCode(langOf(f.path)))
  const violations: Violation[] = []

  // max-lines
  const over = code
    .map((f) => ({ path: f.path, lines: f.facts!.lines }))
    .filter((f) => f.lines > config.maxLines)
    .sort((a, b) => b.lines - a.lines)
  for (const f of over) {
    violations.push({
      rule: 'max-lines',
      path: f.path,
      related: [],
      message: '',
      fingerprint: `max-lines:${f.path}`,
      size: f.lines,
      limit: config.maxLines,
    })
  }

  // folder-size (code files directly in a folder)
  const codePerFolder = new Map<string, number>()
  for (const f of code)
    codePerFolder.set(folderOf(f.path), (codePerFolder.get(folderOf(f.path)) ?? 0) + 1)
  for (const [folder, count] of codePerFolder) {
    if (count <= config.maxFilesPerFolder) continue
    violations.push({
      rule: 'folder-size',
      path: folder,
      related: [],
      message: '',
      fingerprint: `folder-size:${folder}`,
      size: count,
      limit: config.maxFilesPerFolder,
    })
  }

  // import graph: boundaries (any target) and cycles (code ↔ code)
  const edges = new Map<string, string[]>()
  for (const f of code) {
    const lang = langOf(f.path)
    const targets = new Set<string>()
    for (const spec of f.facts!.imports) {
      const target = resolve(f.path, spec, lang)
      if (target && target !== f.path) targets.add(target)
    }
    edges.set(f.path, [...targets])
    for (const b of config.boundaries) {
      if (!matchesGlob(f.path, b.from)) continue
      for (const target of targets) {
        if (!matchesAny(target, b.disallow) || (b.allow && matchesAny(target, b.allow))) continue
        violations.push({
          rule: 'boundary',
          path: f.path,
          related: [target],
          message: b.message ?? '',
          fingerprint: `boundary:${f.path}->${target}`,
        })
      }
    }
  }
  if (config.cycles) {
    for (const members of stronglyConnected(edges)) {
      const sorted = [...members].sort()
      violations.push({
        rule: 'cycle',
        path: sorted[0]!,
        related: sorted.slice(1),
        message: '',
        fingerprint: `cycle:${sorted.join('|')}`,
        size: sorted.length,
      })
    }
  }

  if (config.duplicates) violations.push(...duplicates(code, config.duplicates.minLines))

  const folderCounts = new Map<string, number>()
  for (const f of files)
    folderCounts.set(folderOf(f.path), (folderCounts.get(folderOf(f.path)) ?? 0) + 1)
  const largest = text
    .map((f) => ({ path: f.path, lines: f.facts!.lines }))
    .sort((a, b) => b.lines - a.lines)

  return {
    violations,
    drift: drift(all, isLivingDoc),
    overThreshold: over,
    metrics: {
      truncated: false,
      fileCount: files.length,
      textFileCount: text.length,
      totalLines: text.reduce((n, f) => n + f.facts!.lines, 0),
      lineThreshold: config.maxLines,
      largestFiles: largest.slice(0, 8),
      overThreshold: over.slice(0, 10),
      overThresholdCount: over.length,
      densestFolders: [...folderCounts.entries()]
        .map(([path, n]) => ({ path, files: n }))
        .sort((a, b) => b.files - a.files)
        .slice(0, 5),
    },
  }
}

/** Groups of two or more files that import each other in a loop (Tarjan, iterative). */
export function stronglyConnected(edges: ReadonlyMap<string, readonly string[]>): string[][] {
  let index = 0
  const indices = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const out: string[][] = []
  for (const root of edges.keys()) {
    if (indices.has(root)) continue
    const work: { node: string; next: number }[] = [{ node: root, next: 0 }]
    indices.set(root, index)
    low.set(root, index++)
    stack.push(root)
    onStack.add(root)
    while (work.length > 0) {
      const frame = work[work.length - 1]!
      const targets = (edges.get(frame.node) ?? []).filter((t) => edges.has(t))
      if (frame.next < targets.length) {
        const t = targets[frame.next++]!
        if (!indices.has(t)) {
          indices.set(t, index)
          low.set(t, index++)
          stack.push(t)
          onStack.add(t)
          work.push({ node: t, next: 0 })
        } else if (onStack.has(t)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, indices.get(t)!))
        }
        continue
      }
      work.pop()
      const parent = work[work.length - 1]
      if (parent) low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!))
      if (low.get(frame.node) === indices.get(frame.node)) {
        const group: string[] = []
        let member: string
        do {
          member = stack.pop()!
          onStack.delete(member)
          group.push(member)
        } while (member !== frame.node)
        if (group.length > 1) out.push(group)
      }
    }
  }
  return out
}

function duplicates(code: readonly AnalyzedFile[], minLines: number): Violation[] {
  const seen = new Map<string, string[]>()
  for (const f of code) {
    const hashes = f.facts!.lineHashes
    for (let i = 0; i + minLines <= hashes.length; i++) {
      const key = windowKey(hashes, i, minLines)
      const list = seen.get(key)
      if (!list) seen.set(key, [f.path])
      else if (
        list[list.length - 1] !== f.path &&
        list.length < MAX_DUP_FILES_PER_WINDOW &&
        !list.includes(f.path)
      )
        list.push(f.path)
    }
  }
  const pairs = new Map<string, number>()
  for (const list of seen.values()) {
    if (list.length < 2) continue
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const key = [list[i]!, list[j]!].sort().join('|')
        pairs.set(key, (pairs.get(key) ?? 0) + 1)
      }
  }
  return [...pairs.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_DUP_PAIRS)
    .map(([key, windows]) => {
      const [a, b] = key.split('|') as [string, string]
      return {
        rule: 'duplicate' as const,
        path: a,
        related: [b],
        message: '',
        fingerprint: `duplicate:${key}`,
        // Overlapping windows: n windows of k lines cover about n + k - 1 lines.
        size: windows + minLines - 1,
        limit: minLines,
      }
    })
}

const NOT_A_PATH = /[*?{}<>[\]|$~@\\=:,;()…]|^[-./]|^https?:|YYYY|XXXX|NNNN|\.\.\./

/** Mentions of project paths in living documents that point nowhere. */
function drift(all: readonly AnalyzedFile[], isLivingDoc: (path: string) => boolean): DriftItem[] {
  const files = new Set(all.map((f) => f.path))
  const dirs = new Set<string>()
  for (const f of files) {
    let i = f.indexOf('/')
    while (i >= 0) {
      dirs.add(f.slice(0, i))
      i = f.indexOf('/', i + 1)
    }
  }
  const exists = (p: string | null): boolean => !!p && (files.has(p) || dirs.has(p))
  const norm = (p: string): string | null => {
    const n = posix.normalize(p).replace(/\/$/, '')
    return n.startsWith('..') || n === '.' ? null : n
  }
  const out: DriftItem[] = []
  for (const f of all) {
    if (!f.facts || f.facts.refs.length === 0 || !isLivingDoc(f.path)) continue
    const dir = posix.dirname(f.path)
    for (const ref of f.facts.refs) {
      let target = ref.target.split('#')[0]!.split('?')[0]!
      if (!target) continue
      if (ref.kind === 'link') {
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue
        const p = target.startsWith('/') ? norm(target.slice(1)) : norm(posix.join(dir, target))
        if (p && !exists(p)) out.push({ doc: f.path, line: ref.line, target })
        continue
      }
      // Code spans are paths only when they look like one and start at a real folder.
      target = target.replace(/^\.\//, '')
      if (!target.includes('/') || NOT_A_PATH.test(target)) continue
      // Git does not track empty folders: a folder whose parent exists may just be empty.
      const parent = posix.dirname(target)
      if (
        ref.target.endsWith('/') &&
        (exists(norm(parent)) || exists(norm(posix.join(dir, parent))))
      )
        continue
      const first = target.split('/')[0]!
      const fromRoot = norm(target)
      const fromDoc = norm(posix.join(dir, target))
      const anchored = exists(first) || exists(norm(posix.join(dir, first)))
      if (anchored && !exists(fromRoot) && !exists(fromDoc))
        out.push({ doc: f.path, line: ref.line, target })
    }
  }
  return out.slice(0, 100)
}
