// node-pty 1.1.0 ships its macOS/Linux `spawn-helper` without the executable bit, and npm 11 may
// skip node-pty's own install scripts. Without +x every pty spawn fails with "posix_spawnp failed".
import { chmodSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

if (process.platform !== 'win32') {
  const root = path.join(process.cwd(), 'node_modules', 'node-pty')
  const dirs = [path.join(root, 'build', 'Release')]
  const prebuilds = path.join(root, 'prebuilds')
  if (existsSync(prebuilds))
    for (const d of readdirSync(prebuilds)) dirs.push(path.join(prebuilds, d))
  for (const dir of dirs) {
    const helper = path.join(dir, 'spawn-helper')
    if (existsSync(helper)) {
      chmodSync(helper, 0o755)
      console.log(`fix-node-pty: chmod +x ${path.relative(process.cwd(), helper)}`)
    }
  }
}
