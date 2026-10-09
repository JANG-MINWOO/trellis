// Behavior specs (M4, ADR-0024): one markdown file per area under the project's specs folder.
// Items carry stable ids ("B-001" behaviors, "I-001" invariants) that tests can mention to link.
import type { BehaviorCandidate, Language, SpecItem, SpecKind, TrellisEvent } from './types'

const SECTION_TITLES: Record<Language, Record<SpecKind, string>> = {
  ko: { behavior: '동작', invariant: '불변식' },
  en: { behavior: 'Behaviors', invariant: 'Invariants' },
}
const ALL_SECTION_TITLES: Record<string, SpecKind> = {
  동작: 'behavior',
  behaviors: 'behavior',
  behavior: 'behavior',
  불변식: 'invariant',
  invariants: 'invariant',
  invariant: 'invariant',
}

export const SPEC_ID = /\b([BI])-(\d{3,})\b/g
const ITEM_LINE = /^\s*[-*]\s*\[([BI]-\d{3,})\]\s*(.+?)\s*$/

export interface ParsedSpec {
  title: string
  items: SpecItem[]
}

export function parseSpec(markdown: string): ParsedSpec {
  let title = ''
  let section: SpecKind | null = null
  const items: SpecItem[] = []
  for (const line of markdown.split(/\r?\n/)) {
    const h1 = /^#\s+(.+?)\s*$/.exec(line)
    if (h1 && !title) {
      title = h1[1]!
      continue
    }
    const h2 = /^##\s+(.+?)\s*$/.exec(line)
    if (h2) {
      section = ALL_SECTION_TITLES[h2[1]!.toLowerCase()] ?? null
      continue
    }
    const item = ITEM_LINE.exec(line)
    if (item && section)
      items.push({
        id: item[1]!,
        kind: item[1]!.startsWith('B') ? 'behavior' : 'invariant',
        text: item[2]!,
      })
  }
  return { title, items }
}

/** Highest number used per prefix across all spec files, so ids stay unique in a project. */
export function nextSpecId(kind: SpecKind, existingIds: Iterable<string>): string {
  const prefix = kind === 'behavior' ? 'B' : 'I'
  let max = 0
  for (const id of existingIds) {
    const m = /^([BI])-(\d+)$/.exec(id)
    if (m && m[1] === prefix) max = Math.max(max, Number(m[2]))
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

function render(title: string, items: SpecItem[], lang: Language): string {
  const t = SECTION_TITLES[lang]
  const note =
    lang === 'ko'
      ? '<!-- Trellis가 사람의 확인을 받아 관리하는 동작 명세입니다. 직접 고쳐도 됩니다. 항목은 "- [B-001] 문장" 형식을 지켜 주세요. 테스트 이름이나 내용에 번호를 적으면 연결됩니다. -->'
      : '<!-- Behavior spec kept by Trellis with human confirmation. Edit freely; keep items as "- [B-001] sentence". Mention an id in a test name or body to link the test. -->'
  const section = (kind: SpecKind): string[] => {
    const list = items.filter((i) => i.kind === kind)
    return list.length ? ['', `## ${t[kind]}`, ...list.map((i) => `- [${i.id}] ${i.text}`)] : []
  }
  return [`# ${title}`, '', note, ...section('behavior'), ...section('invariant')].join('\n') + '\n'
}

export interface SpecEdit {
  markdown: string
  itemId: string | null
}

/**
 * Applies an accepted change to an area file (null when the file does not exist yet). Only the
 * affected line changes, so prose and formatting the human added elsewhere are kept.
 */
export function applyToSpec(
  markdown: string | null,
  change: Pick<BehaviorCandidate, 'op' | 'kind' | 'area' | 'targetId'> & { statement: string },
  allIds: Iterable<string>,
  lang: Language,
): SpecEdit {
  const statement = change.statement.replace(/\s+/g, ' ').trim()
  if (markdown === null) {
    const itemId = nextSpecId(change.kind, allIds)
    return {
      markdown: render(change.area, [{ id: itemId, kind: change.kind, text: statement }], lang),
      itemId,
    }
  }
  const eol = markdown.includes('\r\n') ? '\r\n' : '\n'
  const lines = markdown.split(/\r?\n/)
  const targetLine = change.targetId
    ? lines.findIndex((l) => ITEM_LINE.exec(l)?.[1] === change.targetId)
    : -1

  if (change.op === 'remove') {
    if (targetLine >= 0) lines.splice(targetLine, 1)
    return { markdown: lines.join(eol), itemId: targetLine >= 0 ? change.targetId : null }
  }
  if (change.op === 'change' && targetLine >= 0) {
    lines[targetLine] = lines[targetLine]!.replace(
      /^(\s*[-*]\s*\[[BI]-\d+\]\s*).*$/,
      (_, head: string) => head + statement,
    )
    return { markdown: lines.join(eol), itemId: change.targetId }
  }

  const itemId = nextSpecId(change.kind, allIds)
  const item = `- [${itemId}] ${statement}`
  const heading = lines.findIndex((l) => {
    const h2 = /^##\s+(.+?)\s*$/.exec(l)
    return !!h2 && ALL_SECTION_TITLES[h2[1]!.toLowerCase()] === change.kind
  })
  if (heading < 0) {
    while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop()
    lines.push('', `## ${SECTION_TITLES[lang][change.kind]}`, item, '')
    return { markdown: lines.join(eol), itemId }
  }
  let insertAt = heading + 1
  for (let i = heading + 1; i < lines.length && !/^#{1,2}\s/.test(lines[i]!); i++) {
    if (ITEM_LINE.test(lines[i]!)) insertAt = i + 1
  }
  lines.splice(insertAt, 0, item)
  return { markdown: lines.join(eol), itemId }
}

export interface PendingBehavior extends BehaviorCandidate {
  ts: number
  promptId: string | null
}

/** Behavior changes waiting for a human, newest first (computed from the ledger). */
export function pendingBehaviors(events: readonly TrellisEvent[]): PendingBehavior[] {
  const resolved = new Set<string>()
  for (const e of events) if (e.kind === 'behavior.resolved') resolved.add(e.data.candidateId)
  const out: PendingBehavior[] = []
  for (const e of events) {
    if (e.kind === 'behavior.candidate' && !resolved.has(e.data.candidateId))
      out.push({ ...e.data, ts: e.ts, promptId: e.promptId })
  }
  return out.sort((a, b) => b.ts - a.ts)
}
