// Promotes the current source to the "stable build" in /Applications (ADR-0011, ADR-0019).
//   npm run install:local          build, then replace /Applications/Trellis.app
// If Trellis is running (e.g. this runs from Claude inside Trellis), the new app is built now and
// a small background helper swaps it in as soon as you quit Trellis, then reopens it.
// The app is built in a temporary folder outside the project, so no copy is left behind for
// Spotlight or Launchpad to show as a second "Trellis".
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DEST = '/Applications/Trellis.app'

if (process.platform !== 'darwin') {
  console.error(
    'install:local is macOS-only for now. On Windows: npm run dist:win, then run dist\\Trellis-Setup-*.exe',
  )
  process.exit(1)
}

const running = () => spawnSync('pgrep', ['-xq', 'Trellis']).status === 0

function swap(src, outDir) {
  rmSync(DEST, { recursive: true, force: true })
  // ditto keeps permissions, symlinks and extended attributes intact inside the bundle.
  const copy = spawnSync('ditto', [src, DEST], { stdio: 'inherit' })
  if (copy.status !== 0) process.exit(copy.status ?? 1)
  rmSync(outDir, { recursive: true, force: true })
}

// Background mode: wait for Trellis to quit, swap, reopen.
if (process.argv[2] === '--swap-when-quit') {
  const [src, outDir] = process.argv.slice(3)
  const timer = setInterval(() => {
    if (running()) return
    clearInterval(timer)
    swap(src, outDir)
    spawn('open', [DEST], { detached: true, stdio: 'ignore' }).unref()
  }, 1000)
} else {
  const run = (cmd, args, env = {}) => {
    const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } })
    if (r.status !== 0) process.exit(r.status ?? 1)
  }
  const outDir = mkdtempSync(path.join(os.tmpdir(), 'trellis-install-'))
  run('npm', ['run', 'build'])
  run(
    'npx',
    ['electron-builder', '--mac', '--dir', '--publish', 'never', `-c.directories.output=${outDir}`],
    { CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
  )
  const src = ['mac-arm64', 'mac', 'mac-universal']
    .map((d) => path.join(outDir, d, 'Trellis.app'))
    .find((p) => existsSync(p))
  if (!src) {
    console.error(`Built app not found under ${outDir}`)
    process.exit(1)
  }
  if (running()) {
    spawn(process.execPath, [new URL(import.meta.url).pathname, '--swap-when-quit', src, outDir], {
      detached: true,
      stdio: 'ignore',
    }).unref()
    console.log(
      'Trellis is running. Quit it (⌘Q) and the new build replaces /Applications/Trellis.app and reopens.',
    )
  } else {
    swap(src, outDir)
    console.log(`Installed ${DEST}`)
  }
}
