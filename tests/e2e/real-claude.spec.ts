// Runs the real Claude Code CLI inside Trellis. Opt-in (uses your subscription):
//   TRELLIS_REAL_CLAUDE=1 npx playwright test real-claude
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const root = path.resolve(__dirname, '..', '..')
const shots = process.env.TRELLIS_SCREENSHOTS
// Terminal escape sequences (colors, cursor moves) between the words of Claude's prompts.
const ESCAPES = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, 'g')

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

test('real claude: guard sends an over-long file back, analysis runs after the turn', async () => {
  test.skip(process.env.TRELLIS_REAL_CLAUDE !== '1', 'opt-in: set TRELLIS_REAL_CLAUDE=1')
  test.setTimeout(420_000)
  const project = mkdtempSync(path.join(os.tmpdir(), 'trellis-real-guard-'))
  const git = (...args: string[]): void =>
    void execFileSync('git', args, { cwd: project, stdio: 'ignore' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'e2e@example.com')
  git('config', 'user.name', 'e2e')
  execFileSync('mkdir', ['-p', path.join(project, '.trellis')])
  writeFileSync(path.join(project, '.trellis', 'rules.json'), '{"maxLines": 30}\n')
  writeFileSync(path.join(project, 'README.md'), '# guard test\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'init')
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
        // Bash pre-approved: the fix after the guard's "block" often uses it.
        claude: { extraArgs: '--model haiku --allowedTools Bash Write Edit', onProjectOpen: 'ask' },
        analysis: { model: 'haiku' },
      }),
    )
    await win.getByRole('button', { name: '폴더 열기' }).first().click()
    await win.evaluate(async () => {
      const [p] = await window.trellis.projects.list()
      await window.trellis.projects.update(p!.id, {
        guard: { enforceRules: true, checkCommand: '' },
      })
    })
    await win.getByTestId('permission-select').selectOption('acceptEdits')
    await win.getByTestId('launch-new').click()
    const term = win.locator('.xterm').first()
    await expect(term).toBeVisible({ timeout: 20_000 })
    await win.waitForTimeout(5000)
    await term.click()
    await win.keyboard.press('ArrowDown')
    await win.keyboard.press('Enter')
    await win.waitForTimeout(6000)

    const composer = win.getByTestId('composer-input')
    await composer.click()
    await composer.pressSequentially(
      'numbers.js 파일 하나에 1부터 60까지 한 줄에 하나씩 `export const n1 = 1` 형태로 써 줘. 끝나면 "완료"라고만 답해.',
    )
    await composer.press('Enter')

    // The guard answers the first Stop with "block"; Claude reads the reason and keeps working.
    // Its fix may need a Bash approval in this mode: answer "Yes" to permission prompts until the
    // analysis of the finished turn is recorded.
    const kinds = (): Promise<string[]> =>
      win.evaluate(async () => {
        const [p] = await window.trellis.projects.list()
        return (await window.trellis.events.list(p!.id)).map((e) => e.kind)
      })
    const claudeBuffer = async (): Promise<string> => {
      const terms = await win.evaluate(() => window.trellis.terminal.list())
      const id = terms.find((t) => t.kind === 'claude')?.id
      return id ? win.evaluate((tid) => window.trellis.terminal.attach(tid), id) : ''
    }
    let answered = -1
    const deadline = Date.now() + 300_000
    while (Date.now() < deadline && !(await kinds()).includes('analysis.run')) {
      const buf = await claudeBuffer()
      const plain = buf.slice(-6000).replace(ESCAPES, '').replace(/\s+/g, '')
      if (/Doyouwantto(proceed|makethisedit|create)/.test(plain) && buf.length !== answered) {
        answered = buf.length
        await term.click()
        await win.keyboard.press('Enter')
      }
      await win.waitForTimeout(3000)
    }
    const all = await kinds()
    expect(all.filter((k) => k === 'turn.stop').length).toBeGreaterThanOrEqual(2)
    expect(all).toContain('analysis.run')
    const turn = win.getByTestId('turn-card').first()
    await expect(turn.getByTestId('turn-insights')).toContainText('되돌려 보냄 1회')
    // The fix passed the final check: no violation badge on the turn.
    await expect(turn).not.toContainText('규칙 위반')
    if (shots) await win.screenshot({ path: path.join(shots, 'real-11-guard.png') })
    await win.getByRole('tab', { name: /결정/ }).click()
    await expect(win.getByTestId('decisions')).toContainText('작업 분석 1회')
    if (shots) await win.screenshot({ path: path.join(shots, 'real-12-analysis.png') })
  } finally {
    await app.close()
  }
})
