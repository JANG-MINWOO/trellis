// Turns import specifiers into project files, per language. Unresolvable ones (packages, the
// standard library, generated code) are simply not edges — rules only judge the project's files.
import { posix } from 'node:path'
import { stripJsonc } from './config'
import type { Lang } from './facts'

export interface ResolverInput {
  files: readonly string[]
  /** Root-level tsconfig*.json files: their `paths` become aliases. */
  tsconfigs: readonly { path: string; text: string }[]
  aliases: Readonly<Record<string, string>>
}

export type Resolve = (from: string, spec: string, lang: Lang) => string | null

const TS_EXTS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.d.ts',
]
const PY_ROOTS = ['', 'src/', 'lib/', 'app/']

interface Alias {
  prefix: string
  wildcard: boolean
  targets: string[]
}

function tsconfigAliases(tsconfigs: ResolverInput['tsconfigs']): Alias[] {
  const out: Alias[] = []
  for (const { path, text } of tsconfigs) {
    try {
      const options = (
        JSON.parse(stripJsonc(text)) as {
          compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> }
        }
      ).compilerOptions
      if (!options?.paths) continue
      const base = posix.join(posix.dirname(path), options.baseUrl ?? '.')
      for (const [key, targets] of Object.entries(options.paths)) {
        if (!Array.isArray(targets)) continue
        out.push({
          prefix: key.replace(/\*$/, ''),
          wildcard: key.endsWith('*'),
          targets: targets.map((t) => posix.join(base, t)),
        })
      }
    } catch {
      // unreadable tsconfig: no aliases from it
    }
  }
  return out
}

export function createResolver(input: ResolverInput): Resolve {
  const files = new Set(input.files)
  const aliases: Alias[] = [
    ...Object.entries(input.aliases).map(([key, target]) => ({
      prefix: key.replace(/\*$/, ''),
      wildcard: key.endsWith('*'),
      targets: [posix.normalize(target)],
    })),
    ...tsconfigAliases(input.tsconfigs),
  ]
  const godot = input.files
    .filter((f) => f === 'project.godot' || f.endsWith('/project.godot'))
    .sort((a, b) => a.length - b.length)[0]
  const godotRoot = godot ? posix.dirname(godot) : '.'
  // "com/acme/Foo" → file, for every suffix of a Java/Kotlin path without extension.
  const javaIndex = new Map<string, string>()
  for (const f of input.files) {
    const m = /^(.*)\.(java|kt|kts)$/.exec(f)
    if (!m) continue
    const parts = m[1]!.split('/')
    for (let i = 0; i < parts.length; i++) {
      const key = parts.slice(i).join('/')
      if (!javaIndex.has(key)) javaIndex.set(key, f)
    }
  }

  const clean = (p: string): string | null => {
    const n = posix.normalize(p).replace(/^\.\//, '')
    return n.startsWith('..') || n.startsWith('/') ? null : n
  }
  const firstFile = (candidates: string[]): string | null => {
    for (const c of candidates) {
      const p = clean(c)
      if (p && files.has(p)) return p
    }
    return null
  }

  const tsFile = (base: string): string | null => {
    const stripped = base.replace(/\.(js|jsx|mjs|cjs)$/, '')
    return firstFile([
      base,
      ...TS_EXTS.map((e) => base + e),
      ...(stripped !== base ? TS_EXTS.map((e) => stripped + e) : []),
      ...TS_EXTS.map((e) => `${base}/index${e}`),
    ])
  }

  const resolveTs = (from: string, spec: string): string | null => {
    if (spec.startsWith('.')) return tsFile(posix.join(posix.dirname(from), spec))
    if (spec.startsWith('/')) return null
    for (const a of aliases) {
      if (a.wildcard ? !spec.startsWith(a.prefix) : spec !== a.prefix) continue
      const rest = a.wildcard ? spec.slice(a.prefix.length) : ''
      for (const t of a.targets) {
        const hit = tsFile(a.wildcard ? t.replace(/\*$/, '') + rest : t)
        if (hit) return hit
      }
    }
    return null
  }

  const resolvePy = (from: string, spec: string): string | null => {
    const dots = /^\.*/.exec(spec)![0].length
    const mod = spec.slice(dots).replace(/\./g, '/')
    const bases: string[] = []
    if (dots > 0) {
      let dir = posix.dirname(from)
      for (let i = 1; i < dots; i++) dir = posix.dirname(dir)
      bases.push(dir === '.' ? '' : `${dir}/`)
    } else {
      bases.push(...PY_ROOTS)
    }
    for (const b of bases) {
      const hit = mod
        ? firstFile([`${b}${mod}.py`, `${b}${mod}/__init__.py`])
        : firstFile([`${b}__init__.py`])
      if (hit) return hit
    }
    return null
  }

  const resolveJava = (spec: string): string | null => {
    const parts = spec.split('.')
    // "a.b.Foo.method" (static import) → try shorter prefixes.
    for (let n = parts.length; n >= 2; n--) {
      const hit = javaIndex.get(parts.slice(0, n).join('/'))
      if (hit) return hit
    }
    return null
  }

  return (from, spec, lang) => {
    switch (lang) {
      case 'ts':
        return resolveTs(from, spec)
      case 'py':
        return resolvePy(from, spec)
      case 'gd':
        return firstFile([posix.join(godotRoot, spec.replace(/^res:\/\//, ''))])
      case 'java':
        return resolveJava(spec)
      case 'sh':
        return firstFile([posix.join(posix.dirname(from), spec), spec])
      default:
        return null
    }
  }
}
