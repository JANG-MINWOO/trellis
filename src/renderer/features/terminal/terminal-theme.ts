import type { ITheme } from '@xterm/xterm'

export const DEFAULT_TERMINAL_FONT =
  '"JetBrains Mono", "SF Mono", Menlo, Monaco, Consolas, "Cascadia Mono", "D2Coding", "Apple SD Gothic Neo", "Malgun Gothic", monospace'

// The 16 ANSI colors are the terminal's own palette, tuned for program output; they are the one
// exception to "colors come from the design tokens". Everything else follows globals.css.
const DARK_ANSI: ITheme = {
  black: '#1d1e22',
  red: '#f2707a',
  green: '#3ecf8e',
  yellow: '#f0b44c',
  blue: '#6aa7ff',
  magenta: '#c792ea',
  cyan: '#5ccfe6',
  white: '#dcdee3',
  brightBlack: '#5f626b',
  brightRed: '#ff8f97',
  brightGreen: '#6ee3ab',
  brightYellow: '#ffcf7a',
  brightBlue: '#94c1ff',
  brightMagenta: '#ddb3ff',
  brightCyan: '#8ce3f2',
  brightWhite: '#ffffff',
}

const LIGHT_ANSI: ITheme = {
  black: '#24292f',
  red: '#cf222e',
  green: '#116329',
  yellow: '#9a6700',
  blue: '#0969da',
  magenta: '#8250df',
  cyan: '#1b7c83',
  white: '#6e7781',
  brightBlack: '#57606a',
  brightRed: '#a40e26',
  brightGreen: '#1a7f37',
  brightYellow: '#7d4e00',
  brightBlue: '#218bff',
  brightMagenta: '#a475f9',
  brightCyan: '#3192aa',
  brightWhite: '#8c959f',
}

const token = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/** Read after the theme class is applied, so the colors match the rest of the app. */
export function terminalTheme(dark: boolean): ITheme {
  return {
    ...(dark ? DARK_ANSI : LIGHT_ANSI),
    background: token('--terminal-bg'),
    foreground: token('--terminal-fg'),
    cursor: token('--accent'),
    cursorAccent: token('--terminal-bg'),
    selectionBackground: token('--terminal-selection'),
  }
}
