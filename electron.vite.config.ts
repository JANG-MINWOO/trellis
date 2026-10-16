import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Production-only CSP: in dev, Vite injects inline scripts (React refresh) that a strict CSP blocks.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
].join('; ')

const cspPlugin = {
  name: 'trellis-csp',
  apply: 'build' as const,
  transformIndexHtml: (html: string) =>
    html.replace(
      '<head>',
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
    ),
}

/** "0.2.0+14ecc50" (or "+14ecc50-dirty") so the running build is always identifiable. */
function buildStamp(): string {
  const version = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'))
    .version as string
  try {
    const commit = execFileSync('git', ['describe', '--always', '--dirty'], {
      cwd: __dirname,
      encoding: 'utf8',
    }).trim()
    return `${version}+${commit}`
  } catch {
    return version
  }
}
const define = { __TRELLIS_BUILD__: JSON.stringify(buildStamp()) }

const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
}

export default defineConfig({
  main: {
    define,
    resolve: { alias },
    build: {
      externalizeDeps: true,
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    resolve: { alias },
    build: {
      externalizeDeps: true,
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: { ...alias, '@renderer': resolve(__dirname, 'src/renderer') },
    },
    plugins: [react(), tailwindcss(), cspPlugin],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
    },
  },
})
