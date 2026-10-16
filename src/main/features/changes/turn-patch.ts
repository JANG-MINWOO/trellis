// The turn's diff as text for the analysis prompt (ADR-0023).
import type { ChangeEntry } from '@shared/types'
import type { Git } from '../../lib/git'
import type { RepoInfo } from './snapshot'

const MAX_FILE_PATCH = 6000
const LOCKFILE =
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|go\.sum|composer\.lock|Gemfile\.lock)$/

/**
 * Unified diff between two trees, risk-area files first, lockfiles and binaries left out, each
 * file and the whole capped so a huge turn still fits a prompt.
 */
export async function turnPatch(
  git: Git,
  info: RepoInfo,
  startTree: string,
  endTree: string,
  files: readonly ChangeEntry[],
  firstPaths: ReadonlySet<string>,
  maxChars = 40_000,
): Promise<string> {
  const prefix = info.prefix ? `${info.prefix}/` : ''
  const ordered = [...files]
    .filter((f) => !f.binary && !LOCKFILE.test(f.path))
    .sort((a, b) => Number(firstPaths.has(b.path)) - Number(firstPaths.has(a.path)))
  let out = ''
  for (const f of ordered) {
    if (out.length >= maxChars) {
      out += `\n… (more files not shown)\n`
      break
    }
    const diff =
      (await git.tryRun(info.top, [
        'diff-tree',
        '-p',
        '--no-color',
        '-M',
        startTree,
        endTree,
        '--',
        prefix + f.path,
      ])) ?? ''
    out += diff.length > MAX_FILE_PATCH ? `${diff.slice(0, MAX_FILE_PATCH)}\n… (truncated)\n` : diff
  }
  return out.slice(0, maxChars + 200)
}
