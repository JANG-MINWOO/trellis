// End-to-end smoke test: launches the built app with a fake Claude CLI and checks the whole bridge
// — hook settings → HTTP bridge → event ledger → timeline, git → changes — plus tabs, permissions,
// stop/restart and the editor chooser.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, expect, test, type Page } from '@playwright/test'

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

async function buffer(win: Page, kind: 'claude' | 'shell', index = 1): Promise<string> {
  const terms = await win.evaluate(() => window.trellis.terminal.list())
  const term = terms.find((t) => t.kind === kind && t.index === index)
  return term ? win.evaluate((id) => window.trellis.terminal.attach(id), term.id) : ''
}

const shot = async (win: Page, name: string): Promise<void> => {
  if (shots) await win.screenshot({ path: path.join(shots, `${name}.png`) })
}

test('launch card → claude session → per-turn changes, tabs, stop/restart, editor chooser', async () => {
  test.skip(process.platform === 'win32', 'fake CLI is a shebang script')
  const project = makeProject()
  const userData = mkdtempSync(path.join(os.tmpdir(), 'trellis-e2e-data-'))
  // TRELLIS_E2E_EXECUTABLE runs the same test against a packaged app instead of out/.
  const packaged = process.env.TRELLIS_E2E_EXECUTABLE
  const app = await electron.launch({
    ...(packaged ? { executablePath: packaged, args: [] } : { args: [root] }),
    env: {
      ...process.env,
      TRELLIS_E2E: '1',
      TRELLIS_USER_DATA: userData,
      // Packaged runs exercise the real login-shell PATH resolution.
      ...(packaged ? {} : { TRELLIS_SKIP_SHELL_ENV: '1' }),
      TRELLIS_E2E_PICK_FOLDER: project,
      CLAUDE_CONFIG_DIR: path.join(userData, 'claude-config'),
    },
  })
  try {
    const win = await app.firstWindow()
    await win.evaluate(
      (cli) => window.trellis.settings.update({ claude: { path: cli } }),
      fakeClaude,
    )

    // Onboarding: language, tools, default permissions, first project.
    await win.getByTestId('onboarding-next').click()
    await win.getByTestId('onboarding-add-project').click()
    await shot(win, '01-onboarding')
    await win.getByTestId('onboarding-finish').click()

    // The launch card asks for permissions before Claude starts.
    await win.getByTestId('permission-select').selectOption('acceptEdits')
    await shot(win, '02-launch-card')
    await win.getByTestId('launch-new').click()
    await expect(win.getByTestId('timeline')).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => buffer(win, 'claude')).toContain('--permission-mode acceptEdits')

    await win.locator('.xterm').first().click()
    await win.keyboard.type('add a demo file')
    await win.keyboard.press('Enter')

    // The turn lists both files: one reported by the Write tool, one only git could see (Bash).
    const turn = win.getByTestId('turn-card').first()
    await expect(turn).toContainText('add a demo file', { timeout: 20_000 })
    await expect(turn).toContainText('notes.md', { timeout: 20_000 })
    await expect(turn).toContainText('fake-output.txt')
    await shot(win, '03-timeline')

    await win.getByRole('tab', { name: /변경|Changes/ }).click()
    const changes = win.getByTestId('changes')
    await expect(changes).toContainText('fake-output.txt', { timeout: 20_000 })
    await expect(changes).toContainText('notes.md')
    await shot(win, '04-changes')

    await win.getByRole('tab', { name: /결정|Decisions/ }).click()
    await expect(win.getByTestId('decisions')).toContainText('Track changes with git')
    await win.getByRole('tab', { name: /건강|Health/ }).click()
    await expect(win.getByTestId('health')).toBeVisible({ timeout: 20_000 })

    // A shell in a second tab: input reaches the shell, and closing the tab removes it.
    await win.getByTestId('new-tab').click()
    await win.getByTestId('new-shell').click()
    await expect(win.getByTestId('tab-shell-1')).toBeVisible()
    await win.waitForTimeout(1500)
    await win.locator('.xterm:visible').click()
    await win.keyboard.type('echo trellis-shell-ok')
    await win.keyboard.press('Enter')
    await expect.poll(() => buffer(win, 'shell')).toMatch(/trellis-shell-ok[\s\S]*trellis-shell-ok/)
    await shot(win, '05-shell-tab')
    await win.getByTestId('tab-shell-1').getByTestId('tab-close').click()
    await expect(win.getByTestId('tab-shell-1')).toHaveCount(0)

    // Stop Claude: the tab stays and offers a restart with a permission choice.
    await win.getByTestId('tab-claude-1').click()
    await win.getByTestId('stop-claude').click()
    await expect(win.getByTestId('launch-new')).toBeVisible({ timeout: 10_000 })
    await shot(win, '06-stopped')
    await win.getByTestId('launch-new').click()
    await expect(win.getByTestId('stop-claude')).toBeVisible({ timeout: 10_000 })

    // First file open asks which editor to use.
    await win.getByRole('treeitem').filter({ hasText: 'README.md' }).click()
    await expect(win.getByText(/어떤 편집기로 열까요|Open files with which editor/)).toBeVisible()
    await shot(win, '07-editor-chooser')
    await win.keyboard.press('Escape')

    await win.evaluate(() => window.trellis.settings.update({ theme: 'dark' }))
    await win.getByRole('tab', { name: /타임라인|Timeline/ }).click()
    await win.waitForTimeout(400)
    await shot(win, '08-dark')
  } finally {
    await app.close()
  }
})
