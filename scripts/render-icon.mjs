// Renders build/icon.svg to build/icon.png (1024×1024) with Electron's own Chromium, so no extra
// image tooling is needed. Run: npx electron scripts/render-icon.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'

const dir = path.join(process.cwd(), 'build')
const svg = readFileSync(path.join(dir, 'icon.svg'), 'utf8')

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  })
  win.webContents.setZoomFactor(1)
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await new Promise((r) => setTimeout(r, 300))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  const resized =
    image.getSize().width === 1024 ? image : image.resize({ width: 1024, height: 1024 })
  writeFileSync(path.join(dir, 'icon.png'), resized.toPNG())
  console.log('build/icon.png', resized.getSize())
  app.quit()
})
