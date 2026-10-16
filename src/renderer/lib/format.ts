import i18next from 'i18next'

export function relativeTime(ts: number, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(i18next.language, { numeric: 'auto' })
  const diff = Math.round((ts - now) / 1000)
  const abs = Math.abs(diff)
  if (abs < 45) return rtf.format(0, 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86_400), 'day')
}

export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(i18next.language, { hour: '2-digit', minute: '2-digit' })
}

export function dateTime(ts: number): string {
  return new Date(ts).toLocaleString(i18next.language)
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat(i18next.language).format(n)
}

/** "src/features/a.ts" → ["a.ts", "src/features"] */
export function splitPath(path: string): [string, string] {
  const i = path.lastIndexOf('/')
  return i < 0 ? [path, ''] : [path.slice(i + 1), path.slice(0, i)]
}

export function shortenHome(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, '~').replace(/^[A-Za-z]:\\Users\\[^\\]+/, '~')
}
