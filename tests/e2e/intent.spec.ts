// The intent layer end to end (M2, M4): intent with a prediction → a turn → the analysis finds a
// decision and a behavior change → the human records the decision and applies the behavior →
// files appear in the project; "must not" lines become invariants.
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

    // The turn shows the prediction check and what the analysis found.
    const turn = win.getByTestId('turn-card').first()
    await expect(turn.getByTestId('prediction')).toContainText('src/feature', { timeout: 20_000 })
    await expect(turn.getByTestId('prediction')).toContainText('docs')
    await expect(turn.getByTestId('turn-insights')).toContainText(/결정 1|1 decision/, {
      timeout: 20_000,
    })
    await shot(win, '12-turn-insights')

    // Decision: the human writes the reason; the record lands in docs/decisions.
    await win.getByRole('tab', { name: /결정|Decisions/ }).click()
    const card = win.getByTestId('decision-card')
    await expect(card).toContainText('Keep notes in a plain markdown file')
    await expect(win.getByTestId('decision-accept')).toBeDisabled()
    await win.getByTestId('decision-reason').fill('누구나 편집기 없이 바로 읽을 수 있게')
    await shot(win, '13-decision-card')
    await win.getByTestId('decision-accept').click()
    await expect(card).toHaveCount(0)
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
  } finally {
    await app.close()
  }
})
