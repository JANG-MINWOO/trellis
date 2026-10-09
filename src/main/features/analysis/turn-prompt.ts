// What Trellis asks the agent about a finished turn, and how the answer is cleaned up (M2 + M4).
// Pure functions so the wording and the guard rails are testable.
import { matchesAny } from '@shared/glob'
import type {
  BehaviorCandidate,
  ChangeEntry,
  DecisionCandidate,
  DecisionKind,
  Language,
  Risk,
  SpecItem,
} from '@shared/types'

export interface TurnContext {
  projectName: string
  lang: Language
  intent: string | null
  prompt: string
  lastMessage: string
  files: ChangeEntry[]
  patch: string
  decisionTitles: string[]
  specItems: SpecItem[]
}

const KINDS: DecisionKind[] = [
  'dependency',
  'architecture',
  'data',
  'security',
  'api',
  'behavior',
  'infra',
  'other',
]
const RISKS: Risk[] = ['high', 'medium', 'low']
const MAX_DECISIONS = 3
const MAX_BEHAVIORS = 5

const text = { type: 'string' }
export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: text,
          what: text,
          whyGuess: text,
          alternatives: text,
          consequences: text,
          kind: { type: 'string', enum: KINDS },
          risk: { type: 'string', enum: RISKS },
          files: { type: 'array', items: text },
        },
        required: [
          'title',
          'what',
          'whyGuess',
          'alternatives',
          'consequences',
          'kind',
          'risk',
          'files',
        ],
      },
    },
    behaviors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['add', 'change', 'remove'] },
          kind: { type: 'string', enum: ['behavior', 'invariant'] },
          area: text,
          targetId: text,
          statement: text,
          files: { type: 'array', items: text },
        },
        required: ['op', 'kind', 'area', 'targetId', 'statement', 'files'],
      },
    },
  },
  required: ['decisions', 'behaviors'],
}

const LANGUAGE_NAME: Record<Language, string> = { ko: 'Korean', en: 'English' }

export function buildTurnPrompt(ctx: TurnContext): string {
  const files = ctx.files.map(
    (f) => `${f.status} ${f.path}${f.binary ? ' (binary)' : ` (+${f.additions} −${f.deletions})`}`,
  )
  const section = (title: string, body: string): string =>
    `## ${title}\n${body.trim() || '(none)'}\n`
  return [
    'You review ONE finished turn of an AI coding agent for Trellis, a tool that keeps the intent of a',
    'project understood by the humans who own it. Report only two things, and only when they are real.',
    '',
    '1. DECISIONS: choices a teammate would want written down because they are hard to reverse or shape',
    '   future work: adding/removing a dependency; data, schema or storage format; auth, security or',
    '   permission logic; a public API or protocol; architecture or module boundaries; a new pattern the',
    '   codebase will copy; infrastructure, build or deploy configuration; a user-visible behavior choice',
    '   with trade-offs.',
    '   NOT decisions: routine bug fixes, refactors without a design change, renames, formatting,',
    '   comments, documentation wording, tests, minor version bumps. Concerns, risks or TODOs you notice',
    '   are NOT decisions either. Returning no decisions is normal and often correct.',
    `   At most ${MAX_DECISIONS}, most important first. Skip anything already in the existing records.`,
    '   Fields: title (short, imperative), what (1-2 sentences), whyGuess (your guess at the reason; it',
    '   is shown as a guess), alternatives (realistic options not taken), consequences (results and',
    '   costs in plain words a non-developer can judge, no code identifiers), kind, risk, files.',
    '',
    '2. BEHAVIOR CHANGES: what the software now does differently for its users or callers.',
    '   kind "behavior" uses EARS: "WHEN <trigger>, THE SYSTEM SHALL <response>."; kind "invariant" is',
    '   a rule that must always hold. op add/change/remove; targetId is the id of the existing spec',
    '   item being changed or removed, otherwise "". area is the feature in plain product words.',
    '   Use the language of the product, not of the code. Skip internal changes with no outside effect.',
    `   At most ${MAX_BEHAVIORS}. Returning none is fine.`,
    '',
    `Write every text field in ${LANGUAGE_NAME[ctx.lang]}. Only report what the diff shows.`,
    '',
    section('Project', ctx.projectName),
    section('Human intent for this work', ctx.intent ?? ''),
    section('Request in this turn', ctx.prompt),
    section("Agent's final message", ctx.lastMessage),
    section('Changed files', files.join('\n')),
    section(
      'Existing decision records (titles)',
      ctx.decisionTitles.map((t) => `- ${t}`).join('\n'),
    ),
    section('Existing spec items', ctx.specItems.map((i) => `- [${i.id}] ${i.text}`).join('\n')),
    section('Diff (may be truncated)', ctx.patch),
  ].join('\n')
}

const clip = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : ''
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Normalizes the agent's answer: caps counts, keeps only changed files, drops repeats. */
export function toCandidates(
  answer: unknown,
  ctx: Pick<TurnContext, 'files' | 'decisionTitles' | 'specItems'>,
  newId: () => string,
): { decisions: DecisionCandidate[]; behaviors: BehaviorCandidate[] } {
  const changed = new Set(ctx.files.map((f) => f.path))
  const known = new Set(ctx.decisionTitles.map((t) => t.toLowerCase().trim()))
  const specIds = new Set(ctx.specItems.map((i) => i.id))
  const onlyChanged = (v: unknown): string[] =>
    list(v)
      .map((f) => clip(f, 400))
      .filter((f) => changed.has(f))

  const decisions: DecisionCandidate[] = []
  for (const raw of list(obj(answer).decisions)) {
    const d = obj(raw)
    const title = clip(d.title, 160)
    if (!title || known.has(title.toLowerCase())) continue
    decisions.push({
      candidateId: newId(),
      source: 'analysis',
      title,
      what: clip(d.what, 1000),
      whyGuess: clip(d.whyGuess, 1000),
      alternatives: clip(d.alternatives, 1000),
      consequences: clip(d.consequences, 1000),
      kind: KINDS.includes(d.kind as DecisionKind) ? (d.kind as DecisionKind) : 'other',
      risk: RISKS.includes(d.risk as Risk) ? (d.risk as Risk) : 'medium',
      files: onlyChanged(d.files),
    })
    if (decisions.length >= MAX_DECISIONS) break
  }

  const behaviors: BehaviorCandidate[] = []
  for (const raw of list(obj(answer).behaviors)) {
    const b = obj(raw)
    const statement = clip(b.statement, 600)
    const op = b.op === 'change' || b.op === 'remove' ? b.op : 'add'
    const targetId = clip(b.targetId, 20)
    // A change/remove must point at an existing item; otherwise treat it as an addition.
    const target = targetId && specIds.has(targetId) ? targetId : null
    if (!statement && op !== 'remove') continue
    if (op === 'remove' && !target) continue
    behaviors.push({
      candidateId: newId(),
      source: 'analysis',
      op: target ? op : 'add',
      kind: b.kind === 'invariant' ? 'invariant' : 'behavior',
      area: clip(b.area, 60) || 'General',
      targetId: target,
      statement,
      files: onlyChanged(b.files),
    })
    if (behaviors.length >= MAX_BEHAVIORS) break
  }
  return { decisions, behaviors }
}

const RISK_TEXT: Record<
  Language,
  { title: (area: string) => string; what: (files: string[]) => string; consequences: string }
> = {
  ko: {
    title: (area) => `확인이 필요한 영역이 바뀌었어요: ${area}`,
    what: (files) => `이 턴에서 다음 파일이 바뀌었어요: ${files.join(', ')}`,
    consequences:
      '이 영역은 사람이 확인하도록 설정돼 있어요. 의도한 변경인지, 기록해 둘 결정이 있는지 확인해 주세요.',
  },
  en: {
    title: (area) => `A risk area changed: ${area}`,
    what: (files) => `These files changed in this turn: ${files.join(', ')}`,
    consequences:
      'This area is set to always need a human check. Confirm the change is intended and whether a decision should be recorded.',
  },
}

/** One card per risk glob whose files changed and are not already covered by a decision. */
export function riskAreaCandidates(
  files: readonly ChangeEntry[],
  riskAreas: readonly string[],
  covered: ReadonlySet<string>,
  lang: Language,
  newId: () => string,
): DecisionCandidate[] {
  const byGlob = new Map<string, string[]>()
  for (const f of files) {
    if (covered.has(f.path)) continue
    const glob = riskAreas.find((g) => matchesAny(f.path, [g]))
    if (!glob) continue
    byGlob.set(glob, [...(byGlob.get(glob) ?? []), f.path])
  }
  const t = RISK_TEXT[lang]
  return [...byGlob.entries()].map(([glob, paths]) => ({
    candidateId: newId(),
    source: 'risk-area' as const,
    title: t.title(glob),
    what: t.what(paths.slice(0, 10)),
    whyGuess: '',
    alternatives: '',
    consequences: t.consequences,
    kind: 'security' as const,
    risk: 'high' as const,
    files: paths,
  }))
}
