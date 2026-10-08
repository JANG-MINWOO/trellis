import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { Invoke, Push, Send, type TrellisApi } from '@shared/ipc'

function subscribe<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>

const api: TrellisApi = {
  app: { info: () => invoke(Invoke.appInfo) },
  settings: {
    get: () => invoke(Invoke.settingsGet),
    update: (patch) => invoke(Invoke.settingsUpdate, patch),
    onChange: (cb) => subscribe(Push.settingsChanged, cb),
  },
  environment: { check: () => invoke(Invoke.envCheck) },
  projects: {
    list: () => invoke(Invoke.projectsList),
    addViaDialog: () => invoke(Invoke.projectsAddDialog),
    remove: (id) => invoke(Invoke.projectsRemove, id),
    update: (id, patch) => invoke(Invoke.projectsUpdate, id, patch),
    markOpened: (id) => invoke(Invoke.projectsOpened, id),
    reveal: (id, rel) => invoke(Invoke.projectsReveal, id, rel),
    watch: (id) => invoke(Invoke.watchProject, id),
    onFsChanged: (cb) => subscribe(Push.projectFsChanged, cb),
  },
  files: { list: (id, relDir) => invoke(Invoke.filesList, id, relDir) },
  editor: { open: (id, rel) => invoke(Invoke.editorOpen, id, rel) },
  terminal: {
    start: (req) => invoke(Invoke.terminalStart, req),
    write: (terminalId, data) => ipcRenderer.send(Send.terminalWrite, terminalId, data),
    resize: (terminalId, cols, rows) =>
      ipcRenderer.send(Send.terminalResize, terminalId, cols, rows),
    kill: (terminalId) => invoke(Invoke.terminalKill, terminalId),
    list: () => invoke(Invoke.terminalList),
    attach: (terminalId) => invoke(Invoke.terminalAttach, terminalId),
    onData: (cb) => subscribe(Push.terminalData, cb),
    onUpdate: (cb) => subscribe(Push.terminalUpdate, cb),
  },
  events: {
    list: (id, limit) => invoke(Invoke.eventsList, id, limit),
    onEvent: (cb) => subscribe(Push.event, cb),
  },
  intent: { save: (id, text) => invoke(Invoke.intentSave, id, text) },
  changes: {
    get: (id, baseline) => invoke(Invoke.changesGet, id, baseline),
    resetBaseline: (id) => invoke(Invoke.changesResetBaseline, id),
    initRepo: (id) => invoke(Invoke.gitInit, id),
  },
  decisions: { list: (id) => invoke(Invoke.decisionsList, id) },
  health: { get: (id) => invoke(Invoke.healthGet, id) },
  menu: { onCommand: (cb) => subscribe(Push.menuCommand, cb) },
}

contextBridge.exposeInMainWorld('trellis', api)
