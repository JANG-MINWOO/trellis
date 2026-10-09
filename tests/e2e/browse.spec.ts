// Opens an existing folder read-only (Claude not started) and screenshots every panel.
// Opt-in: TRELLIS_BROWSE_PATH=/path/to/project TRELLIS_SCREENSHOTS=/tmp/shots npx playwright test browse
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const root = path.resolve(__dirname, '..', '..')

test('browse an existing project without starting Claude', async () => {
  const target = process.env.TRELLIS_BROWSE_PATH
  test.skip(!target, 'opt-in: set TRELLIS_BROWSE_PATH')
  const shots = process.env.TRELLIS_SCREENSHOTS ?? os.tmpdir()
  const app = await electron.launch({
    args: [root],
    env: {
      ...process.env,
      TRELLIS_E2E: '1',
      TRELLIS_USER_DATA: mkdtempSync(path.join(os.tmpdir(), 'trellis-browse-')),
      TRELLIS_E2E_PICK_FOLDER: target ?? '',
    },
  })
  try {
    const win = await app.firstWindow()
    await win.evaluate(() =>
      window.trellis.settings.update({ language: 'ko', claude: { onProjectOpen: 'ask' } }),
    )
    await win.getByRole('button', { name: '폴더 열기' }).first().click()
    await expect(win.getByText('Claude Code 시작')).toBeVisible({ timeout: 20_000 })
    for (const [tab, file] of [
      ['변경', 'browse-changes'],
      ['결정', 'browse-decisions'],
      ['건강', 'browse-health'],
    ] as const) {
      await win.getByRole('tab', { name: new RegExp(tab) }).click()
      await win.waitForTimeout(tab === '건강' ? 2500 : 1200)
      await win.screenshot({ path: path.join(shots, `${file}.png`) })
    }
  } finally {
    await app.close()
  }
})
