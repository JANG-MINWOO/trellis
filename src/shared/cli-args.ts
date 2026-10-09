// Splits a user-typed argument string ("--model opus --foo 'a b'") into argv without a shell.
// Trellis never builds shell command strings (AGENTS.md §5), so quoting is interpreted here.

export function parseArgs(input: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let hasToken = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!
    if (quote) {
      if (ch === quote) quote = null
      else if (ch === '\\' && quote === '"' && i + 1 < input.length) current += input[++i]
      else current += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      hasToken = true
    } else if (/\s/.test(ch)) {
      if (hasToken) args.push(current)
      current = ''
      hasToken = false
    } else {
      current += ch
      hasToken = true
    }
  }
  if (hasToken) args.push(current)
  return args
}

/**
 * A file path as a terminal would type it after a drag and drop: backslash-escaped on macOS/Linux,
 * double-quoted on Windows when it contains spaces.
 */
export function quotePathForTerminal(path: string, platform: 'darwin' | 'win32' | 'linux'): string {
  if (platform === 'win32') return /\s/.test(path) ? `"${path}"` : path
  return path.replace(/([ \\'"()&;$`!*?#<>|{}[\]])/g, '\\$1')
}
