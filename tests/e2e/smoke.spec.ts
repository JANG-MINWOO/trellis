// End-to-end smoke test: launches the built app with a fake Claude CLI and checks the whole bridge
// — hook settings → HTTP bridge → event ledger → timeline, git → changes — plus tabs, permissions,
// stop/restart and the editor chooser.
import { expect, test } from '@playwright/test'
import { buffer, launchApp, makeProject, onboard, shot } from './support'

test('launch card → claude session → per-turn changes, tabs, stop/restart, editor chooser', async () => {
  test.skip(process.platform === 'win32', 'fake CLI is a shebang script')
  const project = makeProject()
  const { app, win } = await launchApp(project)
  try {
    await onboard(win)

    // The launch card asks for permissions before Claude starts.
    await win.getByTestId('permission-select').selectOption('acceptEdits')
    await shot(win, '02-launch-card')
    await win.getByTestId('launch-new').click()
    await expect(win.getByTestId('timeline')).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => buffer(win, 'claude')).toContain('--permission-mode acceptEdits')

    // Trellis records the session start itself (Claude Code sends no HTTP SessionStart).
    await expect(win.getByTestId('timeline')).toContainText(/새 대화 시작|New conversation/)

    // The input box below the terminal sends composed text (Korean included) as one paste.
    await win.getByTestId('composer-input').fill('add a demo file 한글로 설명해 줘')
    await win.getByTestId('composer-input').press('Enter')
    await expect(win.getByTestId('composer-input')).toHaveValue('')

    // The turn lists both files: one reported by the Write tool, one only git could see (Bash).
    const turn = win.getByTestId('turn-card').first()
    await expect(turn).toContainText('add a demo file 한글로 설명해 줘', { timeout: 20_000 })
    await expect(turn).toContainText('notes.md', { timeout: 20_000 })
    await expect(turn).toContainText('fake-output.txt')
    await shot(win, '03-timeline')

    // Pasting an image into the input box hands it to Claude's own image paste (a chip shows).
    // After the turn on purpose: in the fake CLI's line mode, Ctrl+V would quote the next Enter.
    await win.getByTestId('composer-input').evaluate((el) => {
      const data = new DataTransfer()
      data.items.add(
        new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' }),
      )
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      )
    })
    await expect(win.getByTestId('composer-images')).toBeVisible()

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
