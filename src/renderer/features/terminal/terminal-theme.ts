import type { ITheme } from '@xterm/xterm'

export const DEFAULT_TERMINAL_FONT =
  '"JetBrains Mono", "SF Mono", Menlo, Monaco, Consolas, "Cascadia Mono", "D2Coding", "Apple SD Gothic Neo", "Malgun Gothic", monospace'

export const darkTheme: ITheme = {
  background: '#0f1012',
  foreground: '#dcdee3',
  cursor: '#3ecf8e',
  cursorAccent: '#0f1012',
  selectionBackground: 'rgba(62, 207, 142, 0.28)',
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

export const lightTheme: ITheme = {
  background: '#ffffff',
  foreground: '#1f2328',
  cursor: '#0f9f68',
  cursorAccent: '#ffffff',
  selectionBackground: 'rgba(15, 159, 104, 0.2)',
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
