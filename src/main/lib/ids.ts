import { createHash, randomUUID } from 'node:crypto'

export const newId = (): string => randomUUID()

export function stableId(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 12)
}
