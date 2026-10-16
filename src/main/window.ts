import path from 'node:path'
import { BrowserWindow, dialog, nativeTheme, screen, shell } from 'electron'
import { translate } from '@shared/i18n'
import type { Language } from '@shared/types'
import { readJson, writeJsonAtomic } from './lib/json-file'
import { isMac } from './platform/os'

const COLORS = {
  dark: { background: '#0f1012', symbol: '#c9cbd1' },
  light: { background: '#f6f6f7', symbol: '#3f3f46' },
}
export const TITLE_BAR_HEIGHT = 40

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

export function themeColors(): (typeof COLORS)['dark'] {
  return nativeTheme.shouldUseDarkColors ? COLORS.dark : COLORS.light
}

function visible(state: WindowState): boolean {
  if (state.x === undefined || state.y === undefined) return false
  const area = screen.getDisplayMatching({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
  }).workArea
  return (
    state.x < area.x + area.width - 100 &&
    state.y < area.y + area.height - 100 &&
    state.x + state.width > area.x + 100
  )
}

const DEFAULT_STATE: WindowState = { width: 1440, height: 900, maximized: false }

/** A hand-edited or old file must not produce NaN sizes. */
function toWindowState(raw: unknown): WindowState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined
  return {
    x: num(r.x),
    y: num(r.y),
    width: num(r.width) ?? DEFAULT_STATE.width,
    height: num(r.height) ?? DEFAULT_STATE.height,
    maximized: r.maximized === true,
  }
}

export async function createMainWindow(dataDir: string): Promise<BrowserWindow> {
  const stateFile = path.join(dataDir, 'window-state.json')
  const saved = toWindowState(await readJson<unknown>(stateFile, null))
  const colors = themeColors()
  const mac = isMac()

  const win = new BrowserWindow({
    width: Math.max(saved.width, 960),
    height: Math.max(saved.height, 600),
    ...(visible(saved) ? { x: saved.x, y: saved.y } : {}),
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Trellis',
    backgroundColor: colors.background,
    titleBarStyle: mac ? 'hiddenInset' : 'hidden',
    ...(mac
      ? { trafficLightPosition: { x: 14, y: 13 } }
      : {
          titleBarOverlay: {
            color: colors.background,
            symbolColor: colors.symbol,
            height: TITLE_BAR_HEIGHT,
          },
        }),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })
  if (saved.maximized) win.maximize()

  win.once('ready-to-show', () => win.show())
  win.on('close', () => {
    const bounds = win.getNormalBounds()
    void writeJsonAtomic(stateFile, {
      ...bounds,
      maximized: win.isMaximized(),
    } satisfies WindowState)
  })

  // The renderer never navigates; links open in the user's browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await win.loadFile(path.join(__dirname, '../renderer/index.html'))
  return win
}

export function applyTitleBarTheme(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed() || isMac()) return
  const colors = themeColors()
  win.setTitleBarOverlay({
    color: colors.background,
    symbolColor: colors.symbol,
    height: TITLE_BAR_HEIGHT,
  })
  win.setBackgroundColor(colors.background)
}

/** Quitting ends running Claude sessions; ask first. Returns true when the user confirms. */
export function confirmQuit(lang: Language, running: number): boolean {
  const choice = dialog.showMessageBoxSync({
    type: 'question',
    buttons: [translate(lang, 'quit.confirm'), translate(lang, 'common.cancel')],
    defaultId: 1,
    cancelId: 1,
    message: translate(lang, 'quit.title'),
    detail: translate(lang, 'quit.detail', { count: running }),
  })
  return choice === 0
}
