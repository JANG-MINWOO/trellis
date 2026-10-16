import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import type { TerminalKind } from '@shared/types'
import { api } from '../../lib/api'
import { clipboardHasOnlyImage, droppedPaths, hasFiles } from '../../lib/drop'
import { useIsMac } from '../../state/derived'
import { useStore } from '../../state/store'
import { onTerminalOutput, registerTerminal, unregisterTerminal } from './registry'
import { DEFAULT_TERMINAL_FONT, terminalTheme } from './terminal-theme'

interface Props {
  terminalId: string
  kind: TerminalKind
  visible: boolean
  /** Take keyboard focus when shown (off when the composer should get it instead). */
  focusOnShow: boolean
}

export function XTerm({ terminalId, kind, visible, focusOnShow }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const webglRef = useRef<WebglAddon | null>(null)
  const visibleRef = useRef(visible)
  const focusOnShowRef = useRef(focusOnShow)
  const fontSize = useStore((s) => s.settings?.terminal.fontSize ?? 13)
  const fontFamily = useStore((s) => s.settings?.terminal.fontFamily || DEFAULT_TERMINAL_FONT)
  const isDark = useStore((s) => s.isDark)
  const gpu = useStore((s) => s.settings?.terminal.gpu ?? false)
  const isMac = useIsMac()

  useEffect(() => {
    visibleRef.current = visible
    focusOnShowRef.current = focusOnShow
  }, [visible, focusOnShow])

  // One xterm per terminal id, kept alive while hidden so scrollback survives tab switches.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const s = useStore.getState()
    const term = new Terminal({
      allowProposedApi: true,
      fontFamily: s.settings?.terminal.fontFamily || DEFAULT_TERMINAL_FONT,
      fontSize: s.settings?.terminal.fontSize ?? 13,
      lineHeight: 1.12,
      cursorBlink: true,
      scrollback: 10_000,
      macOptionIsMeta: false,
      drawBoldTextInBrightColors: false,
      theme: terminalTheme(s.isDark),
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new Unicode11Addon())
    term.unicode.activeVersion = '11'
    term.loadAddon(new WebLinksAddon((_event, uri) => window.open(uri)))
    term.open(host)
    termRef.current = term
    fitRef.current = fit

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      // Claude Code reads Esc+CR (meta-enter) as "new line" instead of "submit".
      if (
        kind === 'claude' &&
        e.key === 'Enter' &&
        e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault()
        api.terminal.write(terminalId, '\x1b\r')
        return false
      }
      if (!isMac && e.ctrlKey && !e.altKey && !e.metaKey) {
        const key = e.key.toLowerCase()
        // Ctrl+C copies only when text is selected (or with Shift); otherwise it is SIGINT.
        if (key === 'c' && (e.shiftKey || term.hasSelection())) {
          const selection = term.getSelection()
          if (selection) void navigator.clipboard.writeText(selection)
          term.clearSelection()
          e.preventDefault()
          return false
        }
        // Let the browser fire a paste event; xterm turns it into (bracketed) input.
        if (key === 'v') return false
      }
      return true
    })

    let live = false
    let disposed = false
    const offData = onTerminalOutput(terminalId, (data) => {
      if (live) term.write(data)
    })
    // Output pushed before the attach reply is already inside the returned buffer.
    void api.terminal.attach(terminalId).then((buffer) => {
      if (disposed) return
      if (buffer) term.write(buffer)
      live = true
    })
    const inputSub = term.onData((data) => api.terminal.write(terminalId, data))
    const binarySub = term.onBinary((data) => api.terminal.write(terminalId, data))
    const resizeSub = term.onResize(({ cols, rows }) => api.terminal.resize(terminalId, cols, rows))
    registerTerminal(terminalId, term)

    // Images: Claude reads the clipboard itself when it gets its paste-image key (Cmd+V would
    // otherwise paste nothing). Dropped files are typed in as escaped paths, like other terminals.
    const onPaste = (e: ClipboardEvent): void => {
      if (kind !== 'claude' || !clipboardHasOnlyImage(e.clipboardData)) return
      e.preventDefault()
      e.stopPropagation()
      api.terminal.pasteImage(terminalId)
    }
    const onDragOver = (e: DragEvent): void => {
      if (!hasFiles(e.dataTransfer)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (e: DragEvent): void => {
      const paths = droppedPaths(e.dataTransfer, useStore.getState().appInfo?.platform)
      if (paths.length === 0) return
      e.preventDefault()
      term.paste(`${paths.join(' ')} `)
      term.focus()
    }
    host.addEventListener('paste', onPaste, true)
    host.addEventListener('dragover', onDragOver)
    host.addEventListener('drop', onDrop)

    const observer = new ResizeObserver(() => {
      if (!visibleRef.current) return
      requestAnimationFrame(() => {
        try {
          fit.fit()
        } catch {
          // host not measurable yet
        }
      })
    })
    observer.observe(host)

    return () => {
      disposed = true
      observer.disconnect()
      host.removeEventListener('paste', onPaste, true)
      host.removeEventListener('dragover', onDragOver)
      host.removeEventListener('drop', onDrop)
      offData()
      inputSub.dispose()
      binarySub.dispose()
      resizeSub.dispose()
      unregisterTerminal(terminalId)
      webglRef.current?.dispose()
      webglRef.current = null
      term.dispose()
      termRef.current = null
    }
  }, [terminalId, kind, isMac])

  // Optional GPU rendering, only for the visible terminal (browsers cap WebGL contexts). The DOM
  // renderer is the default because it always repaints; WebGL is faster but can silently stall.
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    if (visible) {
      if (gpu && !webglRef.current) {
        try {
          const webgl = new WebglAddon()
          webgl.onContextLoss(() => {
            webgl.dispose()
            webglRef.current = null
          })
          term.loadAddon(webgl)
          webglRef.current = webgl
        } catch {
          webglRef.current = null
        }
      }
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit()
        } catch {
          // ignore
        }
        if (focusOnShowRef.current) term.focus()
      })
    }
    if ((!visible || !gpu) && webglRef.current) {
      webglRef.current.dispose()
      webglRef.current = null
    }
  }, [visible, gpu])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontSize = fontSize
    term.options.fontFamily = fontFamily
    term.options.theme = terminalTheme(isDark)
    if (visibleRef.current) {
      try {
        fitRef.current?.fit()
      } catch {
        // ignore
      }
    }
  }, [fontSize, fontFamily, isDark])

  return (
    <div
      className="absolute inset-0 bg-terminal py-2 pl-3"
      style={{ visibility: visible ? 'visible' : 'hidden', zIndex: visible ? 1 : 0 }}
      onMouseDown={() => termRef.current?.focus()}
    >
      <div ref={hostRef} className="h-full w-full" />
    </div>
  )
}
