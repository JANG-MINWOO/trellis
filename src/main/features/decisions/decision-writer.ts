import { promises as fs } from 'node:fs'
import path from 'node:path'
import { nextRecordName, renderDecisionRecord } from '@shared/decisions'
import type { DecisionCandidate, DecisionResolution, Language } from '@shared/types'
import { resolveInsideProject } from '../../platform/paths'

/**
 * Writes an approved decision as the next numbered record in the project's decisions folder.
 * Returns the project-relative path, or null when the project keeps no decision files.
 * Never overwrites: if the name is taken, the number moves on.
 */
export async function writeDecisionRecord(
  root: string,
  dir: string,
  candidate: DecisionCandidate,
  resolution: Pick<DecisionResolution, 'reason' | 'reasonFromGuess'>,
  lang: Language,
): Promise<string | null> {
  if (!dir.trim()) return null
  const abs = resolveInsideProject(root, dir)
  if (!abs) return null
  await fs.mkdir(abs, { recursive: true })
  const names = await fs.readdir(abs)
  for (let attempt = 0; attempt < 5; attempt++) {
    const { number, file } = nextRecordName(names, candidate.title)
    try {
      await fs.writeFile(
        path.join(abs, file),
        renderDecisionRecord(number, candidate, resolution, lang, new Date()),
        {
          encoding: 'utf8',
          flag: 'wx',
        },
      )
      return `${dir.replace(/\/$/, '')}/${file}`
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      names.push(file)
    }
  }
  throw new Error('could not find a free record number')
}
