// Runs the real Claude Code CLI inside Trellis. Opt-in (uses your subscription):
//   TRELLIS_REAL_CLAUDE=1 npx playwright test real-claude
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const root = path.resolve(__dirname, '..', '..')
const shots = process.env.TRELLIS_SCREENSHOTS

test('real claude: trust prompt, Korean prompt with Shift+Enter, hooks reach the panels', async () => {
  test.skip(process.env.TRELLIS_REAL_CLAUDE !== '1', 'opt-in: set TRELLIS_REAL_CLAUDE=1')
  test.setTimeout(240_000)
  const project = mkdtempSync(path.join(os.tmpdir(), 'trellis-real-'))
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project })
  writeFileSync(path.join(project, 'README.md'), '# real claude test\n')
  const userData = mkdtempSync(path.join(os.tmpdir(), 'trellis-real-data-'))

  const app = await electron.launch({
    args: [root],
    env: {
      ...process.env,
      TRELLIS_E2E: '1',
      TRELLIS_USER_DATA: userData,
      TRELLIS_E2E_PICK_FOLDER: project,
    },
  })
  try {
    const win = await app.firstWindow()
    await win.evaluate(() =>
      window.trellis.settings.update({
        language: 'ko',
        claude: { extraArgs: '--model haiku', onProjectOpen: 'ask' },
      }),
    )
    await win.getByRole('button', { name: '폴더 열기' }).first().click()
    await win.getByTestId('permission-select').selectOption('acceptEdits')
    await win.getByTestId('launch-new').click()

    // New folder → Claude asks whether to trust it. Default is "No, exit": move down, confirm.
    const term = win.locator('.xterm').first()
    await expect(term).toBeVisible({ timeout: 20_000 })
    await win.waitForTimeout(5000)
    if (shots) await win.screenshot({ path: path.join(shots, 'real-01-trust.png') })
    await term.click()
    await win.keyboard.press('ArrowDown')
    await win.keyboard.press('Enter')
    await win.waitForTimeout(6000)

    // Send through the input box: Korean, two lines (Shift+Enter), one paste + Enter.
    const composer = win.getByTestId('composer-input')
    await composer.click()
    await composer.pressSequentially('hello.txt 파일을 만들고 안에 hi 라고 써 줘.')
    await composer.press('Shift+Enter')
    await composer.pressSequentially('끝나면 한국어로 "완료"라고만 답해 줘.')
    await composer.press('Enter')

    await expect(win.getByTestId('timeline')).toContainText('새 대화 시작')
    const turn = win.getByTestId('turn-card').first()
    await expect(turn).toContainText('hello.txt', { timeout: 120_000 })
    await expect(turn).toContainText('완료', { timeout: 120_000 })
    const prompt = await turn.locator('p').first().innerText()
    expect(prompt).toContain('\n')
    if (shots) await win.screenshot({ path: path.join(shots, 'real-02-done.png') })

    // The turn's file list comes from git at the end of the turn (works even if Claude used Bash).
    await expect(turn.getByText('A', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    await expect(win.getByText('수정 자동 허용').first()).toBeVisible()

    await win.getByRole('tab', { name: /변경/ }).click()
    await expect(win.getByTestId('changes')).toContainText('hello.txt', { timeout: 20_000 })
    if (shots) await win.screenshot({ path: path.join(shots, 'real-03-changes.png') })
  } finally {
    await app.close()
  }
})
