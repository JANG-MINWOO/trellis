// The intent layer end to end (M2, M4, ADR-0034): intent with a prediction → a turn → the analysis
// finds a decision and a behavior change → the human records the decision and applies the behavior
// → files appear in the project; "must not" lines become invariants. Then the task goes on for
// another turn, the work moves to something else (Trellis asks, the human starts a new task), and
// the new task is finished and reopened.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, makeProject, onboard, shot } from './support'

test('intent → turn analysis → decision record and behavior spec', async () => {
  test.skip(process.platform === 'win32', 'fake CLI is a shebang script')
  const project = makeProject()
  const { app, win } = await launchApp(project)
  try {
    await onboard(win)
    await win.getByTestId('launch-new').click()
    await expect(win.getByTestId('timeline')).toBeVisible({ timeout: 20_000 })

    // Intent: goal, must-not, and where the change should land (root files and docs).
    await win.getByTestId('intent-edit').click()
    await win.getByTestId('intent-goal').fill('프롬프트를 notes.md에 남긴다')
    await win.getByTestId('intent-mustnot').fill('README는 바꾸지 않는다')
    await win.locator('[data-testid="intent-area"][title^=". "]').click()
    await win.locator('[data-testid="intent-area"][title^="docs "]').click()
    await win.getByTestId('intent-save').click()
    await shot(win, '11-intent')

    await win.getByTestId('composer-input').fill('write notes')
    await win.getByTestId('composer-input').press('Enter')

    // The turn shows what nobody predicted and what the analysis found; the intent card follows
    // the task: the root was predicted and changed, src/feature was not predicted.
    const turn = win.getByTestId('turn-card').first()
    await expect(turn.getByTestId('prediction')).toContainText('src/feature', { timeout: 20_000 })
    await expect(turn.getByTestId('turn-insights')).toContainText(/결정 1|1 decision/, {
      timeout: 20_000,
    })
    const card = win.getByTestId('intent-card')
    await expect(card.getByTestId('intent-status')).toContainText(/턴 1개|1 turn/)
    await expect(card.getByTestId('task-unexpected')).toContainText('src/feature')
    await shot(win, '12-turn-insights')

    // Decision: the human writes the reason; the record lands in docs/decisions.
    await win.getByRole('tab', { name: /결정|Decisions/ }).click()
    const decision = win.getByTestId('decision-card')
    await expect(decision).toContainText('Keep notes in a plain markdown file')
    await expect(win.getByTestId('decision-accept')).toBeDisabled()
    await win.getByTestId('decision-reason').fill('누구나 편집기 없이 바로 읽을 수 있게')
    await shot(win, '13-decision-card')
    await win.getByTestId('decision-accept').click()
    await expect(decision).toHaveCount(0)
    const record = path.join(
      project,
      'docs',
      'decisions',
      '0002-keep-notes-in-a-plain-markdown-file.md',
    )
    await expect.poll(() => existsSync(record)).toBe(true)
    const text = readFileSync(record, 'utf8')
    expect(text).toContain('누구나 편집기 없이 바로 읽을 수 있게')
    expect(text).toContain('notes.md')
    expect(text).not.toContain('not-changed.md')
    await expect(win.getByTestId('decisions')).toContainText('ADR-0002: Keep notes')

    // Behavior: applied to docs/specs/notes.md with a stable id.
    await win.getByRole('tab', { name: /동작|Behavior/ }).click()
    await expect(win.getByTestId('behavior-card')).toContainText('append it to notes.md')
    await win.getByTestId('behavior-accept').click()
    await expect(win.getByTestId('spec-item')).toContainText('B-001')
    expect(readFileSync(path.join(project, 'docs', 'specs', 'notes.md'), 'utf8')).toContain(
      '[B-001] WHEN a prompt is sent',
    )

    // "Must not" from the intent becomes an invariant candidate, then an item.
    await win.getByTestId('intent-invariants').click()
    await expect(win.getByTestId('behavior-card')).toContainText('README는 바꾸지 않는다')
    await win.getByTestId('behavior-accept').click()
    await expect(win.getByTestId('specs')).toContainText('I-001')
    await shot(win, '14-specs')
    // The invariant's area is the UI word for "general", so it follows the machine's language.
    const specFiles = readdirSync(path.join(project, 'docs', 'specs')).sort()
    expect(specFiles).toContain('notes.md')
    expect(specFiles.filter((f) => f !== 'notes.md')).toEqual([
      expect.stringMatching(/^(공통|general)\.md$/),
    ])

    // Second turn of the same task: same areas, so nothing new is unexpected on the turn. The
    // analysis reads it as breaking the must-not line, which shows on the turn and the task.
    await win.getByRole('tab', { name: /타임라인|Timeline/ }).click()
    await win.getByTestId('composer-input').fill('write more notes BREAK')
    await win.getByTestId('composer-input').press('Enter')
    await expect(card.getByTestId('intent-status')).toContainText(/턴 2개|2 turns/)
    await expect(card.getByTestId('task-mustnot')).toBeVisible({ timeout: 20_000 })
    const second = win.getByTestId('turn-card').first()
    await expect(second.getByTestId('turn-insights')).toBeVisible()
    await expect(second.getByTestId('prediction')).toHaveCount(0)
    await expect(card.getByTestId('task-check')).toHaveCount(0)

    // Different work in the same conversation: the analysis says so, Trellis asks, and the human
    // starts a new task that takes in that turn.
    await win.getByTestId('composer-input').fill('OTHER rename the logo')
    await win.getByTestId('composer-input').press('Enter')
    const check = card.getByTestId('task-check')
    await expect(check).toHaveAttribute('data-reason', 'off-intent', { timeout: 20_000 })
    await expect(check).toContainText('OTHER rename the logo')
    await shot(win, '15-task-check')
    await check.getByTestId('task-check-new').click()
    await win.getByTestId('intent-goal').fill('로고 파일 이름을 바꾼다')
    await win.getByTestId('intent-save').click()
    await expect(card.getByTestId('intent-status')).toContainText(/턴 1개|1 turn/)
    await expect(card.getByTestId('task-check')).toHaveCount(0)
    await expect(win.getByTestId('timeline-task-end')).toHaveCount(1)
    await expect(win.getByTestId('timeline-intent')).toHaveCount(2)

    // Finishing ends the task: the card sums it up and turns get no intent until the next one.
    await card.getByTestId('intent-finish').click()
    await expect(card.getByTestId('intent-status')).toContainText(/마무리함|Finished/)
    await expect(win.getByTestId('timeline-task-end')).toHaveCount(2)
    await shot(win, '16-task-finished')
    await card.getByTestId('intent-reopen').click()
    await expect(card.getByTestId('intent-status')).toContainText(/진행 중|In progress/)
    await expect(win.getByTestId('timeline-task-end')).toHaveCount(1)
  } finally {
    await app.close()
  }
})
