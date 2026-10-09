// Where the rules engine gets files from: a git tree (turn start/end, working-copy snapshot) or,
// for folders without git, the folder itself. Facts are cached by content, so checking two trees
// that share most files reads and parses each file once.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Git, RepoInfo } from '../changes'
import type { AnalyzedFile } from './engine'
import { extractFacts, langOf, type FileFacts } from './facts'

const MAX_FILES = 30_000
const MAX_TEXT_BYTES = 1024 * 1024
const MAX_CACHE = 60_000
const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|icns|bmp|tiff?|psd|pdf|zip|gz|tgz|bz2|xz|7z|rar|jar|war|class|o|a|so|dylib|dll|exe|bin|wasm|mp3|wav|ogg|flac|mp4|mov|avi|webm|ttf|otf|woff2?|eot|glb|gltf|fbx|blend|import|res|scn|pck|db|sqlite)$/i
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  '.venv',
  'venv',
  '__pycache__',
  '.godot',
  '.next',
  'target',
])

interface Entry {
  path: string
  key: string
  size: number
}

export interface Listing {
  files: AnalyzedFile[]
  truncated: boolean
  /** Text of small config files the analysis needs (rules, baseline, tsconfig). */
  configs: Map<string, string>
}

const isConfig = (p: string): boolean =>
  p === '.trellis/rules.json' || p === '.trellis/baseline.json' || /^tsconfig[^/]*\.json$/.test(p)

export class FactsCache {
  private readonly map = new Map<string, FileFacts | null>()

  get(key: string): FileFacts | null | undefined {
    return this.map.get(key)
  }

  set(key: string, facts: FileFacts | null): void {
    if (this.map.size >= MAX_CACHE) this.map.clear()
    this.map.set(key, facts)
  }
}

function toFacts(p: string, buf: Buffer): FileFacts | null {
  if (buf.subarray(0, 8000).includes(0)) return null
  return extractFacts(p, buf.toString('utf8'))
}

async function load(
  entries: Entry[],
  cache: FactsCache,
  read: (missing: Entry[]) => Promise<Map<string, Buffer>>,
): Promise<Listing> {
  const truncated = entries.length > MAX_FILES
  const list = entries.slice(0, MAX_FILES)
  const cacheKey = (e: Entry): string => `${e.key}:${langOf(e.path)}`
  const readable = (e: Entry): boolean => e.size <= MAX_TEXT_BYTES && !BINARY_EXT.test(e.path)
  const missing = list.filter(
    (e) => (readable(e) && cache.get(cacheKey(e)) === undefined) || isConfig(e.path),
  )
  const contents = await read(missing)
  const configs = new Map<string, string>()
  for (const e of missing) {
    const buf = contents.get(e.key)
    if (!buf) continue
    if (isConfig(e.path)) configs.set(e.path, buf.toString('utf8'))
    if (readable(e)) cache.set(cacheKey(e), toFacts(e.path, buf))
  }
  return {
    truncated,
    configs,
    files: list.map((e) => ({
      path: e.path,
      size: e.size,
      facts: readable(e) ? (cache.get(cacheKey(e)) ?? null) : null,
    })),
  }
}

/** Files of a git tree under the project folder (paths relative to the project). */
export async function listTree(
  git: Git,
  info: RepoInfo,
  tree: string,
  cache: FactsCache,
): Promise<Listing> {
  const out = await git.run(info.top, ['ls-tree', '-r', '-z', '--long', '--full-tree', tree], {
    timeoutMs: 60_000,
  })
  const prefix = info.prefix ? `${info.prefix}/` : ''
  const entries: Entry[] = []
  for (const record of out.split('\0')) {
    const tab = record.indexOf('\t')
    if (tab < 0) continue
    const [mode, type, sha, size] = record.slice(0, tab).split(/\s+/)
    const full = record.slice(tab + 1)
    // Symlinks (120000) and submodules (commit) carry no content of their own.
    if (type !== 'blob' || mode === '120000' || !sha || !full.startsWith(prefix)) continue
    entries.push({ path: full.slice(prefix.length), key: sha, size: Number(size) || 0 })
  }
  return load(entries, cache, (missing) =>
    git.readBlobs(info.top, [...new Set(missing.map((e) => e.key))]),
  )
}

/** Files of a folder without git (keyed by size and modification time). */
export async function listFolder(root: string, cache: FactsCache): Promise<Listing> {
  const entries: Entry[] = []
  const walk = async (rel: string): Promise<void> => {
    if (entries.length > MAX_FILES) return
    let dirents: import('node:fs').Dirent[]
    try {
      dirents = await fs.readdir(path.join(root, ...rel.split('/').filter(Boolean)), {
        withFileTypes: true,
      })
    } catch {
      return
    }
    for (const d of dirents) {
      const child = rel ? `${rel}/${d.name}` : d.name
      if (d.isDirectory()) {
        if (!SKIP_DIRS.has(d.name)) await walk(child)
      } else if (d.isFile()) {
        try {
          const stat = await fs.stat(path.join(root, ...child.split('/')))
          entries.push({
            path: child,
            key: `fs:${child}:${stat.size}:${stat.mtimeMs}`,
            size: stat.size,
          })
        } catch {
          // vanished
        }
      }
    }
  }
  await walk('')
  return load(entries, cache, async (missing) => {
    const out = new Map<string, Buffer>()
    for (const e of missing) {
      try {
        out.set(e.key, await fs.readFile(path.join(root, ...e.path.split('/'))))
      } catch {
        // vanished
      }
    }
    return out
  })
}
