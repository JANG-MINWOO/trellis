// Shared setup for the Electron end-to-end tests: a throwaway git project, the app launched on
// isolated data folders with the fake Claude CLI, and small helpers.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

const root = path.resolve(__dirname, '..', '..')
export const fakeClaude = path.join(__dirname, 'fixtures', 'fake-claude.mjs')
const shots = process.env.TRELLIS_SCREENSHOTS

export function makeProject(): string {
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

/** Launches Trellis on fresh data folders with `project` as the folder the picker returns. */
export async function launchApp(project: string): Promise<{ app: ElectronApplication; win: Page }> {
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
  const win = await app.firstWindow()
  await win.evaluate((cli) => window.trellis.settings.update({ claude: { path: cli } }), fakeClaude)
  return { app, win }
}

/** Onboarding with defaults and the picked project. */
export async function onboard(win: Page): Promise<void> {
  await win.getByTestId('onboarding-next').click()
  await win.getByTestId('onboarding-add-project').click()
  await shot(win, '01-onboarding')
  await win.getByTestId('onboarding-finish').click()
}

export async function buffer(win: Page, kind: 'claude' | 'shell', index = 1): Promise<string> {
  const terms = await win.evaluate(() => window.trellis.terminal.list())
  const term = terms.find((t) => t.kind === kind && t.index === index)
  return term ? win.evaluate((id) => window.trellis.terminal.attach(id), term.id) : ''
}

export const shot = async (win: Page, name: string): Promise<void> => {
  if (shots) await win.screenshot({ path: path.join(shots, `${name}.png`) })
}
