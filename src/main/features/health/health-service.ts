// Basic, language-agnostic structure indicators (M1). Rules, baselines and trends come in M3.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { HEALTH_LINE_THRESHOLD } from '@shared/defaults'
import type { HealthReport } from '@shared/types'
import type { Git } from '../changes'

const MAX_FILES = 20_000
const MAX_TEXT_BYTES = 2 * 1024 * 1024
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

async function listFiles(
  root: string,
  git: Git | null,
  inRepo: boolean,
): Promise<{ files: string[]; truncated: boolean }> {
  if (git && inRepo) {
    const out = await git.tryRun(root, [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
    ])
    if (out !== null) {
      const files = [...new Set(out.split('\0').filter(Boolean))]
      return { files: files.slice(0, MAX_FILES), truncated: files.length > MAX_FILES }
    }
  }
  const files: string[] = []
  const walk = async (rel: string): Promise<void> => {
    if (files.length >= MAX_FILES) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(path.join(root, ...rel.split('/').filter(Boolean)), {
        withFileTypes: true,
      })
    } catch {
      return
    }
    for (const e of entries) {
      if (files.length >= MAX_FILES) return
      const child = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await walk(child)
      } else if (e.isFile()) {
        files.push(child)
      }
    }
  }
  await walk('')
  return { files, truncated: files.length >= MAX_FILES }
}

async function countLines(file: string): Promise<number | null> {
  try {
    const stat = await fs.stat(file)
    if (!stat.isFile() || stat.size > MAX_TEXT_BYTES) return null
    const buf = await fs.readFile(file)
    if (buf.subarray(0, 8000).includes(0)) return null
    if (buf.length === 0) return 0
    let lines = 0
    for (const byte of buf) if (byte === 10) lines++
    return buf[buf.length - 1] === 10 ? lines : lines + 1
  } catch {
    return null
  }
}

export async function computeHealth(
  root: string,
  git: Git | null,
  inRepo: boolean,
): Promise<HealthReport> {
  const { files, truncated } = await listFiles(root, git, inRepo)
  const withLines: { path: string; lines: number }[] = []
  const folderCounts = new Map<string, number>()
  for (let i = 0; i < files.length; i += 32) {
    const batch = files.slice(i, i + 32)
    const counts = await Promise.all(batch.map((f) => countLines(path.join(root, ...f.split('/')))))
    batch.forEach((f, j) => {
      const folder = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '.'
      folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1)
      const lines = counts[j]
      if (lines !== null && lines !== undefined) withLines.push({ path: f, lines })
    })
  }
  withLines.sort((a, b) => b.lines - a.lines)
  const over = withLines.filter((f) => f.lines > HEALTH_LINE_THRESHOLD)
  return {
    computedAt: Date.now(),
    truncated,
    fileCount: files.length,
    textFileCount: withLines.length,
    totalLines: withLines.reduce((n, f) => n + f.lines, 0),
    lineThreshold: HEALTH_LINE_THRESHOLD,
    largestFiles: withLines.slice(0, 8),
    overThreshold: over.slice(0, 10),
    overThresholdCount: over.length,
    densestFolders: [...folderCounts.entries()]
      .map(([p, n]) => ({ path: p, files: n }))
      .sort((a, b) => b.files - a.files)
      .slice(0, 5),
  }
}
