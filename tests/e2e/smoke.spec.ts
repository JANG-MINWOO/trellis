// End-to-end smoke test: launches the built app with a fake Claude CLI and checks that the whole
// bridge works — hook settings → HTTP bridge → event ledger → timeline, and git → changes panel.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const root = path.resolve(__dirname, '..', '..')
const fakeClaude = path.join(__dirname, 'fixtures', 'fake-claude.mjs')
const shots = process.env.TRELLIS_SCREENSHOTS

function makeProject(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'trellis-e2e-project-'))
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'e2e@example.com')
  git('config', 'user.name', 'e2e')
  mkdirSync(path.join(dir, 'docs', 'decisions'), { recursive: true })
  writeFileSync(path.join(dir, 'README.md'), '# demo\n')
  writeFileSync(
    path.join(dir, 'docs', 'decisions', '0001-use-git.md'),
    '# ADR-0001: Track changes with git\n\n- 상태: 채택\n',
  )
  git('add', '-A')
  git('commit', '-q', '-m', 'init')
  return dir
}

test('onboarding → claude session → timeline and changes', async () => {
  test.skip(process.platform === 'win32', 'fake CLI is a shebang script')
  const project = makeProject()
  const userData = mkdtempSync(path.join(os.tmpdir(), 'trellis-e2e-data-'))
  const app = await electron.launch({
    args: [root],
    env: {
      ...process.env,
      TRELLIS_E2E: '1',
      TRELLIS_USER_DATA: userData,
      TRELLIS_SKIP_SHELL_ENV: '1',
      TRELLIS_E2E_PICK_FOLDER: project,
      CLAUDE_CONFIG_DIR: path.join(userData, 'claude-config'),
    },
  })
  try {
    const win = await app.firstWindow()

    // Point Trellis at the fake CLI before any project opens.
    await win.evaluate(
      (cli) => window.trellis.settings.update({ claude: { path: cli } }),
      fakeClaude,
    )

    await win.getByTestId('onboarding-next').click()
    await win.getByTestId('onboarding-add-project').click()
    if (shots) await win.screenshot({ path: path.join(shots, '01-onboarding.png') })
    await win.getByTestId('onboarding-finish').click()

    // Claude starts automatically; its SessionStart hook reaches the timeline.
    await expect(win.getByTestId('timeline')).toBeVisible({ timeout: 20_000 })

    await win.locator('.xterm').first().click()
    await win.keyboard.type('add a demo file')
    await win.keyboard.press('Enter')

    const turn = win.getByTestId('turn-card').first()
    await expect(turn).toContainText('add a demo file', { timeout: 20_000 })
    await expect(turn).toContainText('fake-output.txt')
    await expect(win.getByTestId('claude-state')).toBeVisible()
    if (shots) await win.screenshot({ path: path.join(shots, '02-timeline.png') })

    await win.getByRole('tab', { name: /변경|Changes/ }).click()
    const changes = win.getByTestId('changes')
    await expect(changes).toContainText('fake-output.txt', { timeout: 20_000 })
    await expect(changes).toContainText('src/feature')
    if (shots) await win.screenshot({ path: path.join(shots, '03-changes.png') })

    await win.getByRole('tab', { name: /결정|Decisions/ }).click()
    await expect(win.getByTestId('decisions')).toContainText('Track changes with git')

    await win.getByRole('tab', { name: /건강|Health/ }).click()
    await expect(win.getByTestId('health')).toBeVisible({ timeout: 20_000 })
    if (shots) await win.screenshot({ path: path.join(shots, '04-health.png') })

    // Light theme renders too.
    await win.evaluate(() => window.trellis.settings.update({ theme: 'light' }))
    await win.getByRole('tab', { name: /타임라인|Timeline/ }).click()
    await win.waitForTimeout(400)
    if (shots) await win.screenshot({ path: path.join(shots, '05-light.png') })
    await win.evaluate(() => window.trellis.settings.update({ theme: 'dark' }))
    await win.waitForTimeout(400)
    if (shots) await win.screenshot({ path: path.join(shots, '06-dark.png') })
  } finally {
    await app.close()
  }
})
