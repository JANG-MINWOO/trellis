import { describe, expect, it } from 'vitest'
import { applyToSpec, nextSpecId, parseSpec } from './specs'

const sample = `# 로그인

## 동작
- [B-001] WHEN 비밀번호를 5회 틀리면, THE SYSTEM SHALL 계정을 30분 잠근다.
- [B-004] WHEN 잠긴 계정으로 로그인하면, THE SYSTEM SHALL 남은 시간을 알려 준다.

## 불변식
- [I-002] 탈퇴한 회원의 데이터는 조회되지 않는다.
`

describe('parseSpec', () => {
  it('reads title and items by section', () => {
    const spec = parseSpec(sample)
    expect(spec.title).toBe('로그인')
    expect(spec.items.map((i) => `${i.kind}:${i.id}`)).toEqual([
      'behavior:B-001',
      'behavior:B-004',
      'invariant:I-002',
    ])
  })
})

describe('nextSpecId', () => {
  it('continues after the highest id of the same kind', () => {
    expect(nextSpecId('behavior', ['B-001', 'B-004', 'I-002'])).toBe('B-005')
    expect(nextSpecId('invariant', ['B-001'])).toBe('I-001')
  })
})

describe('applyToSpec', () => {
  it('adds to a new file', () => {
    const edit = applyToSpec(
      null,
      {
        op: 'add',
        kind: 'behavior',
        area: '결제',
        targetId: null,
        statement: 'WHEN 결제하면, THE SYSTEM SHALL 영수증을 보낸다.',
      },
      ['B-007'],
      'ko',
    )
    expect(edit.itemId).toBe('B-008')
    expect(edit.markdown).toContain('# 결제')
    expect(edit.markdown).toContain('## 동작\n- [B-008] WHEN 결제하면')
  })

  it('changes and removes existing items', () => {
    const changed = applyToSpec(
      sample,
      {
        op: 'change',
        kind: 'behavior',
        area: '로그인',
        targetId: 'B-001',
        statement: 'WHEN 비밀번호를 3회 틀리면, THE SYSTEM SHALL 계정을 잠근다.',
      },
      ['B-001', 'B-004', 'I-002'],
      'ko',
    )
    expect(changed.itemId).toBe('B-001')
    expect(parseSpec(changed.markdown).items.find((i) => i.id === 'B-001')?.text).toContain('3회')
    const removed = applyToSpec(
      sample,
      { op: 'remove', kind: 'invariant', area: '로그인', targetId: 'I-002', statement: '' },
      ['I-002'],
      'ko',
    )
    expect(parseSpec(removed.markdown).items.map((i) => i.id)).toEqual(['B-001', 'B-004'])
  })

  it('keeps hand-written text and inserts into the right section', () => {
    const withProse = sample.replace('## 동작', '잠금은 보안팀 요청이다.\n\n## 동작')
    const added = applyToSpec(
      withProse,
      {
        op: 'add',
        kind: 'behavior',
        area: '로그인',
        targetId: null,
        statement: 'WHEN  x,\nTHE SYSTEM SHALL y.',
      },
      ['B-001', 'B-004', 'I-002'],
      'ko',
    )
    expect(added.itemId).toBe('B-005')
    expect(added.markdown).toContain('잠금은 보안팀 요청이다.')
    expect(added.markdown).toContain(
      '- [B-004] WHEN 잠긴 계정으로 로그인하면, THE SYSTEM SHALL 남은 시간을 알려 준다.\n- [B-005] WHEN x, THE SYSTEM SHALL y.\n\n## 불변식',
    )
    const newSection = applyToSpec(
      '# 결제\n\n## 동작\n- [B-001] a\n',
      {
        op: 'add',
        kind: 'invariant',
        area: '결제',
        targetId: null,
        statement: '금액은 음수가 아니다.',
      },
      ['B-001'],
      'ko',
    )
    expect(newSection.markdown).toBe(
      '# 결제\n\n## 동작\n- [B-001] a\n\n## 불변식\n- [I-001] 금액은 음수가 아니다.\n',
    )
    const gone = applyToSpec(
      sample,
      { op: 'remove', kind: 'behavior', area: '로그인', targetId: 'B-404', statement: '' },
      [],
      'ko',
    )
    expect(gone).toEqual({ markdown: sample, itemId: null })
  })
})
