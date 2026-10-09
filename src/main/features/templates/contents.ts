// Starter files for a project (M3). Short on purpose: they are a frame for people to fill in.
import type { Language } from '@shared/types'

export type Stack = 'node' | 'python' | 'godot' | 'java' | 'go' | 'rust' | 'generic'

export function detectStack(rootFiles: ReadonlySet<string>): Stack {
  if (rootFiles.has('project.godot')) return 'godot'
  if (rootFiles.has('package.json')) return 'node'
  if (['pyproject.toml', 'requirements.txt', 'setup.py'].some((f) => rootFiles.has(f)))
    return 'python'
  if (['pom.xml', 'build.gradle', 'build.gradle.kts'].some((f) => rootFiles.has(f))) return 'java'
  if (rootFiles.has('go.mod')) return 'go'
  if (rootFiles.has('Cargo.toml')) return 'rust'
  return 'generic'
}

const EXCLUDE: Record<Stack, string[]> = {
  node: ['dist/**', 'build/**', 'out/**', 'coverage/**', '**/*.d.ts'],
  python: ['**/migrations/**', 'build/**', '.tox/**'],
  godot: ['addons/**', '.godot/**'],
  java: ['build/**', 'target/**', '**/generated/**'],
  go: ['vendor/**'],
  rust: ['target/**'],
  generic: [],
}

export function rulesJson(stack: Stack): string {
  const config = {
    $comment:
      'Trellis structure rules. Changing them is a human decision. boundaries example: [{"from": "src/ui/**", "disallow": ["src/db/**"], "message": "UI goes through services"}]',
    maxLines: stack === 'node' ? 300 : 400,
    maxFilesPerFolder: 25,
    duplicates: { minLines: 12 },
    cycles: true,
    boundaries: [],
    exclude: EXCLUDE[stack],
  }
  return JSON.stringify(config, null, 2) + '\n'
}

export function agentsMd(
  lang: Language,
  name: string,
  dirs: { decisions: string; specs: string },
  checkCommand: string,
): string {
  const check =
    checkCommand || (lang === 'ko' ? '(검사 명령을 적어 주세요)' : '(write the check command here)')
  if (lang === 'ko')
    return `# ${name} — 작업 규칙

사람과 에이전트(Claude Code, Codex 등) 모두에게 적용된다.

## 이 프로젝트
(무엇을 위한 프로젝트인지 두세 줄로 적어 주세요.)

## 의도는 어디에 있나
${dirs.specs ? `- 동작과 불변식: \`${dirs.specs}/\` — 바뀌면 사람이 확인하고 반영한다.\n` : ''}${dirs.decisions ? `- 결정과 이유: \`${dirs.decisions}/\` — 되돌리기 어려운 선택은 여기에 남긴다.\n` : ''}- 구조 규칙: \`.trellis/rules.json\` — 바꾸는 것은 사람의 결정이다.

## 작업 원칙
- 의존성 추가, 데이터 형식 변경, 인증·결제 관련 변경은 먼저 묻는다.
- 파일이 너무 길어지면 기능을 더하기 전에 나누는 것부터 제안한다.
- 요청 범위를 넘는 변경은 하지 않는다. 필요해 보이면 따로 제안한다.
- 작업을 마치기 전에 \`${check}\`를 통과시킨다.
`
  return `# ${name} — working rules

For people and agents (Claude Code, Codex, …) alike.

## This project
(Two or three lines on what this project is for.)

## Where the intent lives
${dirs.specs ? `- Behaviors and invariants: \`${dirs.specs}/\` — changes are confirmed by a person.\n` : ''}${dirs.decisions ? `- Decisions and reasons: \`${dirs.decisions}/\` — choices that are hard to reverse.\n` : ''}- Structure rules: \`.trellis/rules.json\` — changing them is a human decision.

## Working principles
- Ask before adding a dependency, changing a data format, or touching auth or payments.
- When a file grows too long, propose splitting it before adding more.
- Stay within the request. Propose anything beyond it separately.
- Pass \`${check}\` before finishing.
`
}

/** Claude Code reads CLAUDE.md; importing AGENTS.md keeps one source for every agent. */
export const claudeMd = '@AGENTS.md\n'

export function decisionsReadme(lang: Language): string {
  if (lang === 'ko')
    return `# 결정 기록

결정 하나에 파일 하나(\`0001-제목.md\`). 짧게 쓴다. Trellis가 작업에서 찾은 결정 중 사람이 이유를 적어 승인한 것이 여기에 쌓인다.
결정을 뒤집을 때는 원래 파일을 지우지 않고 새 기록을 쓴 뒤 원래 기록의 상태를 "대체됨"으로 바꾼다.

## 템플릿
\`\`\`markdown
# ADR-0001: 제목

- 상태: 채택
- 날짜: YYYY-MM-DD
- 결정한 사람:

## 결정
## 이유
## 대안
## 결과와 대가
\`\`\`
`
  return `# Decision records

One decision per file (\`0001-title.md\`), kept short. Decisions Trellis found in the work land here once a person wrote the reason and approved them.
To reverse a decision, do not delete the file: write a new record and mark the old one as superseded.

## Template
\`\`\`markdown
# ADR-0001: Title

- Status: accepted
- Date: YYYY-MM-DD
- Decided by:

## Decision
## Reason
## Alternatives
## Consequences and costs
\`\`\`
`
}

export function specsReadme(lang: Language): string {
  if (lang === 'ko')
    return `# 동작 명세

기능 영역 하나에 파일 하나. 사용자에게 보이는 동작과 항상 지켜야 하는 규칙을 제품의 말로 적는다.

- 동작: \`- [B-001] WHEN <언제>, THE SYSTEM SHALL <무엇을 한다>.\` (\`## 동작\` 아래)
- 불변식: \`- [I-001] <항상 지켜야 하는 규칙>\` (\`## 불변식\` 아래)
- 번호는 프로젝트 전체에서 이어지고 바뀌지 않는다. 테스트 이름이나 내용에 번호를 적으면 Trellis가 연결해 보여준다.
`
  return `# Behavior specs

One file per feature area, in the language of the product.

- Behaviors: \`- [B-001] WHEN <trigger>, THE SYSTEM SHALL <response>.\` (under \`## Behaviors\`)
- Invariants: \`- [I-001] <rule that always holds>\` (under \`## Invariants\`)
- Ids continue across the project and never change. Mention an id in a test name or body and Trellis links it.
`
}
