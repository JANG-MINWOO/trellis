// What the rules need to know about one file, extracted once per content (cached by blob id):
// line count, import specifiers, normalized line hashes for duplicates, path mentions in docs.

export type Lang = 'ts' | 'py' | 'gd' | 'java' | 'sh' | 'code' | 'md' | 'text'

const BY_EXT: Record<string, Lang> = {
  ts: 'ts',
  tsx: 'ts',
  mts: 'ts',
  cts: 'ts',
  js: 'ts',
  jsx: 'ts',
  mjs: 'ts',
  cjs: 'ts',
  vue: 'ts',
  svelte: 'ts',
  py: 'py',
  gd: 'gd',
  java: 'java',
  kt: 'java',
  kts: 'java',
  sh: 'sh',
  bash: 'sh',
  zsh: 'sh',
  go: 'code',
  rs: 'code',
  rb: 'code',
  php: 'code',
  cs: 'code',
  swift: 'code',
  c: 'code',
  cc: 'code',
  cpp: 'code',
  h: 'code',
  hpp: 'code',
  m: 'code',
  mm: 'code',
  scala: 'code',
  lua: 'code',
  dart: 'code',
  ex: 'code',
  exs: 'code',
  ps1: 'code',
  md: 'md',
  mdx: 'md',
}

export function langOf(path: string): Lang {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return 'text'
  return BY_EXT[name.slice(dot + 1).toLowerCase()] ?? 'text'
}

export const isCode = (lang: Lang): boolean => lang !== 'md' && lang !== 'text'

export interface DocRef {
  target: string
  line: number
  kind: 'link' | 'code'
}

export interface FileFacts {
  lines: number
  imports: string[]
  /** One hash per meaningful line, for duplicate detection (code only). */
  lineHashes: number[]
  /** Paths mentioned in a markdown document. */
  refs: DocRef[]
}

export function countLines(text: string): number {
  if (text.length === 0) return 0
  let n = 0
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++
  return text.endsWith('\n') ? n : n + 1
}

function fnv(text: string, seed = 0x811c9dc5): number {
  let h = seed
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const BORING =
  /^(import|from|export\s+\*|export\s+\{[^}]*\}\s+from|#include|using|package|require|extends|class_name|@)/
const COMMENT = /^(\/\/|#|\*|\/\*|--|<!--|""")/

function lineHashes(text: string): number[] {
  const out: number[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/\s+/g, ' ')
    if (line.length < 4 || BORING.test(line) || COMMENT.test(line)) continue
    if ((line.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < 4) continue
    out.push(fnv(line))
  }
  return out
}

const TS_IMPORT =
  /(?:^|[^.\w$])(?:import|export)\s+(?:type\s+)?(?:[\w$*{}\s,]+?\s+from\s+)?['"]([^'"\n]+)['"]/g
const TS_CALL = /\b(?:require|import)\(\s*['"]([^'"\n]+)['"]\s*\)/g
const PY_IMPORT = /^[ \t]*import[ \t]+([\w.]+(?:[ \t]*,[ \t]*[\w.]+)*)/gm
const PY_FROM = /^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+\(?[ \t]*([\w \t,*]+)/gm
const GD_RES = /(?:preload|load)\(\s*"res:\/\/([^"]+)"\s*\)|^\s*extends\s+"res:\/\/([^"]+)"/gm
const JAVA_IMPORT = /^\s*import\s+(?:static\s+)?([\w.]+)(?:\.\*)?\s*;?/gm
const SH_SOURCE = /^\s*(?:source|\.)\s+["']?([^\s"';|&$]+)/gm
const MD_LINK = /\[[^\]\n]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g
const MD_CODE = /`([^`\s]+)`/g

function imports(lang: Lang, text: string): string[] {
  const out = new Set<string>()
  const add = (re: RegExp, pick: (m: RegExpMatchArray) => (string | undefined)[]): void => {
    for (const m of text.matchAll(re)) for (const v of pick(m)) if (v) out.add(v)
  }
  if (lang === 'ts') {
    add(TS_IMPORT, (m) => [m[1]])
    add(TS_CALL, (m) => [m[1]])
  } else if (lang === 'py') {
    add(PY_IMPORT, (m) => m[1]!.split(',').map((s) => s.trim()))
    add(PY_FROM, (m) => {
      const base = `${m[1]}${m[2]}`
      // "from pkg import mod" may import a submodule; the resolver tries both.
      const names = m[3]!
        .split(',')
        .map((s) => s.trim().split(/\s+/)[0]!)
        .filter((s) => s && s !== '*')
      return [base, ...names.map((n) => (m[2] ? `${base}.${n}` : `${m[1]}${n}`))]
    })
  } else if (lang === 'gd') {
    add(GD_RES, (m) => [m[1] ?? m[2]].map((v) => (v ? `res://${v}` : undefined)))
  } else if (lang === 'java') {
    add(JAVA_IMPORT, (m) => [m[1]])
  } else if (lang === 'sh') {
    add(SH_SOURCE, (m) => [m[1]])
  }
  return [...out]
}

function docRefs(text: string): DocRef[] {
  const refs: DocRef[] = []
  let inFence = false
  text.split('\n').forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    // Links written inside code spans are examples, not links.
    const prose = line.replace(MD_CODE, '')
    for (const m of prose.matchAll(MD_LINK)) refs.push({ target: m[1]!, line: i + 1, kind: 'link' })
    for (const m of line.matchAll(MD_CODE)) refs.push({ target: m[1]!, line: i + 1, kind: 'code' })
  })
  return refs
}

export function extractFacts(path: string, text: string): FileFacts {
  const lang = langOf(path)
  return {
    lines: countLines(text),
    imports: isCode(lang) ? imports(lang, text) : [],
    lineHashes: isCode(lang) ? lineHashes(text) : [],
    refs: lang === 'md' ? docRefs(text) : [],
  }
}

/** Two independent hashes of a run of line hashes, as one map key. */
export function windowKey(hashes: readonly number[], start: number, length: number): string {
  let a = 0x811c9dc5
  let b = 0x01000193
  for (let i = start; i < start + length; i++) {
    a = Math.imul(a ^ hashes[i]!, 0x01000193) >>> 0
    b = Math.imul(b ^ hashes[i]!, 0x5bd1e995) >>> 0
  }
  return `${a.toString(36)}.${b.toString(36)}`
}
