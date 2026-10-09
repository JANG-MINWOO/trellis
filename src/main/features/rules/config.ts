// Structure rules of a project (ADR-0026): `.trellis/rules.json` in the project, so the team and
// every agent see the same rules. Missing file → defaults. Unknown keys are ignored.
import { HEALTH_LINE_THRESHOLD } from '@shared/defaults'

export interface Boundary {
  /** Files the rule applies to (glob). */
  from: string
  /** Import targets those files must not use (globs). */
  disallow: string[]
  /** Exceptions to `disallow`. */
  allow?: string[]
  message?: string
}

export interface RulesConfig {
  maxLines: number
  maxFilesPerFolder: number
  duplicates: { minLines: number } | null
  cycles: boolean
  boundaries: Boundary[]
  exclude: string[]
  /** Import aliases on top of tsconfig paths, e.g. {"@shared/*": "src/shared/*"}. */
  aliases: Record<string, string>
}

export const RULES_FILE = '.trellis/rules.json'
export const BASELINE_FILE = '.trellis/baseline.json'

/** Generated, vendored and bundled files say nothing about the structure people maintain. */
export const DEFAULT_EXCLUDE = [
  '**/*.min.*',
  '**/*.generated.*',
  '**/*.g.*',
  '**/__snapshots__/**',
  '**/vendor/**',
  '**/third_party/**',
  '**/node_modules/**',
  '**/*.lock',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
]

export function defaultRulesConfig(): RulesConfig {
  return {
    maxLines: HEALTH_LINE_THRESHOLD,
    maxFilesPerFolder: 30,
    duplicates: { minLines: 12 },
    cycles: true,
    boundaries: [],
    exclude: [...DEFAULT_EXCLUDE],
    aliases: {},
  }
}

/** Removes // and /* *\/ comments and trailing commas outside strings (tsconfig-style JSON). */
export function stripJsonc(text: string): string {
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (inString) {
      out += c
      if (c === '\\') out += text[++i] ?? ''
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      out += c
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (c === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i++
    } else {
      out += c
    }
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}

const num = (v: unknown, d: number): number => (typeof v === 'number' && v > 0 ? Math.floor(v) : d)
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []

export function parseRulesConfig(text: string | null): {
  config: RulesConfig
  error: string | null
} {
  const config = defaultRulesConfig()
  if (text === null) return { config, error: null }
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(stripJsonc(text)) as Record<string, unknown>
    if (!raw || typeof raw !== 'object') throw new Error('not an object')
  } catch (error) {
    return { config, error: (error as Error).message }
  }
  config.maxLines = num(raw.maxLines, config.maxLines)
  config.maxFilesPerFolder = num(raw.maxFilesPerFolder, config.maxFilesPerFolder)
  if (raw.duplicates === false || raw.duplicates === null) config.duplicates = null
  else if (raw.duplicates && typeof raw.duplicates === 'object')
    config.duplicates = {
      minLines: Math.max(4, num((raw.duplicates as Record<string, unknown>).minLines, 12)),
    }
  if (typeof raw.cycles === 'boolean') config.cycles = raw.cycles
  if (Array.isArray(raw.boundaries)) {
    config.boundaries = raw.boundaries.flatMap((b): Boundary[] => {
      const r = (b ?? {}) as Record<string, unknown>
      const from = typeof r.from === 'string' ? r.from : ''
      const disallow = strings(r.disallow)
      if (!from || disallow.length === 0) return []
      return [
        {
          from,
          disallow,
          allow: strings(r.allow),
          message: typeof r.message === 'string' ? r.message : undefined,
        },
      ]
    })
  }
  if (Array.isArray(raw.exclude)) config.exclude = [...DEFAULT_EXCLUDE, ...strings(raw.exclude)]
  if (raw.aliases && typeof raw.aliases === 'object') {
    for (const [k, v] of Object.entries(raw.aliases as Record<string, unknown>))
      if (typeof v === 'string') config.aliases[k] = v
  }
  return { config, error: null }
}
