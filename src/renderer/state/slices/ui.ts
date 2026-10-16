import i18n from '../../i18n'
import { api } from '../../lib/api'
import type { Slice, UiSlice } from '../types'

let toastSeq = 0

export const createUiSlice: Slice<UiSlice> = (set, get) => ({
  rightTab: 'timeline',
  settingsOpen: false,
  settingsSection: 'general',
  toasts: [],
  editorChooser: null,
  panelToggle: null,

  async openFile(projectId, path) {
    const result = await api.editor.open(projectId, path)
    if (result.ok) return
    if (result.message === 'ask' || result.message === 'editor-missing') {
      set({ editorChooser: { projectId, path } })
    } else {
      get().toast('error', i18n.t('toast.editorFailed', { message: result.message ?? '' }))
    }
  },

  closeEditorChooser() {
    set({ editorChooser: null })
  },

  setRightTab(rightTab) {
    set({ rightTab })
  },

  openSettings(section = 'general') {
    set({ settingsOpen: true, settingsSection: section })
  },

  closeSettings() {
    set({ settingsOpen: false })
  },

  toast(kind, message) {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }))
    window.setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3500)
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  togglePanel(side) {
    set((s) => ({ panelToggle: { side, n: (s.panelToggle?.n ?? 0) + 1 } }))
  },
})
