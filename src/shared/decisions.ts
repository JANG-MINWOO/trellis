// Decision candidates and records (M2). Pending = candidates without a resolution, computed from
// the ledger. Records are short markdown files the human approved (ADR-0023).
import type { DecisionCandidate, DecisionResolution, Language, TrellisEvent } from './types'

export interface PendingDecision extends DecisionCandidate {
  ts: number
  promptId: string | null
  terminalId: string | null
}

export function pendingDecisions(events: readonly TrellisEvent[]): PendingDecision[] {
  const resolved = new Set<string>()
  for (const e of events) if (e.kind === 'decision.resolved') resolved.add(e.data.candidateId)
  const out: PendingDecision[] = []
  for (const e of events) {
    if (e.kind !== 'decision.candidate' || resolved.has(e.data.candidateId)) continue
    out.push({ ...e.data, ts: e.ts, promptId: e.promptId, terminalId: e.terminalId })
  }
  return out.sort((a, b) => b.ts - a.ts)
}

/** "use-bcrypt-for-passwords"; keeps Korean letters so names stay readable. */
export function slugify(title: string, fallback = 'decision'): string {
  const slug = title
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return slug || fallback
}

/** Next record file name, numbering after existing "NNNN-*.md" files. */
export function nextRecordName(
  existing: readonly string[],
  title: string,
): { number: number; file: string } {
  let max = 0
  for (const name of existing) {
    const m = /^(\d{3,5})[-_]/.exec(name)
    if (m) max = Math.max(max, Number(m[1]))
  }
  const number = max + 1
  return { number, file: `${String(number).padStart(4, '0')}-${slugify(title)}.md` }
}

const LABELS = {
  ko: {
    status: '상태',
    accepted: '채택',
    date: '날짜',
    who: '결정한 사람',
    whoValue: '사람 (Trellis가 작업에서 찾아 확인을 받음)',
    decision: '결정',
    reason: '이유',
    guessNote: '(AI가 짐작한 이유를 사람이 그대로 확인함)',
    alternatives: '대안',
    consequences: '결과와 대가',
    files: '관련 파일',
    none: '기록하지 않음',
  },
  en: {
    status: 'Status',
    accepted: 'Accepted',
    date: 'Date',
    who: 'Decided by',
    whoValue: 'A human (found in an agent turn by Trellis and confirmed)',
    decision: 'Decision',
    reason: 'Reason',
    guessNote: '(the agent’s guessed reason, confirmed as is)',
    alternatives: 'Alternatives',
    consequences: 'Consequences and trade-offs',
    files: 'Related files',
    none: 'Not recorded',
  },
} as const

export function renderDecisionRecord(
  number: number,
  candidate: DecisionCandidate,
  resolution: Pick<DecisionResolution, 'reason' | 'reasonFromGuess'>,
  lang: Language,
  date: Date,
): string {
  const l = LABELS[lang]
  const day = date.toISOString().slice(0, 10)
  const reason = resolution.reason.trim() || l.none
  const lines = [
    `# ADR-${String(number).padStart(4, '0')}: ${candidate.title}`,
    '',
    `- ${l.status}: ${l.accepted}`,
    `- ${l.date}: ${day}`,
    `- ${l.who}: ${l.whoValue}`,
    '',
    `## ${l.decision}`,
    candidate.what.trim() || candidate.title,
    '',
    `## ${l.reason}`,
    resolution.reasonFromGuess ? `${reason} ${l.guessNote}` : reason,
    '',
    `## ${l.alternatives}`,
    candidate.alternatives.trim() || l.none,
    '',
    `## ${l.consequences}`,
    candidate.consequences.trim() || l.none,
  ]
  if (candidate.files.length > 0)
    lines.push('', `## ${l.files}`, ...candidate.files.map((f) => `- \`${f}\``))
  return lines.join('\n') + '\n'
}
