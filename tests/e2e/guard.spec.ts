// The guard (M3): with "check at the end of work" on, a turn that leaves a new rule violation is
// sent back to the agent, which fixes it and stops again. Also the starter templates.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { buffer, launchApp, makeProject, onboard, shot } from './support'

test('guard sends a turn back; templates create the rules file', async () => {
  test.skip(process.platform === 'win32', 'fake CLI is a shebang script')
  const project = makeProject()
  const { app, win } = await launchApp(project)
  try {
    await onboard(win)
    await win.evaluate(async () => {
      const [p] = await window.trellis.projects.list()
      await window.trellis.projects.update(p!.id, {
        guard: { enforceRules: true, checkCommand: 'node -e "process.exit(0)"' },
        analysisEnabled: false,
      })
    })
    await win.getByTestId('launch-new').click()
    await expect(win.getByTestId('timeline')).toBeVisible({ timeout: 20_000 })

    await win.getByTestId('composer-input').fill('make a BIGFILE')
    await win.getByTestId('composer-input').press('Enter')

    // The agent hears why it was sent back, fixes the file, and stops again.
    await expect
      .poll(() => buffer(win, 'claude'), { timeout: 30_000 })
      .toContain('Blocked: [Trellis')
    await expect
      .poll(() => buffer(win, 'claude'), { timeout: 30_000 })
      .toContain('Done: make a BIGFILE')
    const turn = win.getByTestId('turn-card').first()
    await expect(turn.getByTestId('turn-insights')).toContainText(
      /되돌려 보냄 1회|sent back 1 time/,
      { timeout: 20_000 },
    )
    await expect(turn).not.toContainText(/규칙 위반|rule break/)
    expect(
      readFileSync(path.join(project, 'src', 'feature', 'big.ts'), 'utf8').split('\n'),
    ).toHaveLength(11)
    await shot(win, '21-guard')

    // Starter files: rules, instructions (with a CLAUDE.md import), decision and spec READMEs.
    await win.getByRole('tab', { name: /건강|Health/ }).click()
    await expect(win.getByTestId('rules')).toBeVisible({ timeout: 20_000 })
    await win.getByTestId('templates-open').click()
    await shot(win, '22-templates')
    await win.getByTestId('templates-apply').click()
    // The dialog closes once every file is written.
    await expect(win.getByTestId('templates-apply')).toHaveCount(0)
    expect(existsSync(path.join(project, '.trellis', 'rules.json'))).toBe(true)
    expect(readFileSync(path.join(project, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n')
    expect(existsSync(path.join(project, 'docs', 'specs', 'README.md'))).toBe(true)
    await expect(win.getByTestId('rules')).toContainText('.trellis/rules.json', { timeout: 10_000 })
    await shot(win, '23-health')
  } finally {
    await app.close()
  }
})
