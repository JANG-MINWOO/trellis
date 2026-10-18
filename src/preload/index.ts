import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
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
    areas: (id) => invoke(Invoke.projectAreas, id),
    onFsChanged: (cb) => subscribe(Push.projectFsChanged, cb),
  },
  files: {
    list: (id, relDir) => invoke(Invoke.filesList, id, relDir),
    pathForFile: (file) => webUtils.getPathForFile(file),
  },
  editor: {
    open: (id, rel) => invoke(Invoke.editorOpen, id, rel),
    list: () => invoke(Invoke.editorList),
  },
  terminal: {
    start: (req) => invoke(Invoke.terminalStart, req),
    write: (terminalId, data) => ipcRenderer.send(Send.terminalWrite, terminalId, data),
    resize: (terminalId, cols, rows) =>
      ipcRenderer.send(Send.terminalResize, terminalId, cols, rows),
    pasteImage: (terminalId) => ipcRenderer.send(Send.terminalPasteImage, terminalId),
    kill: (terminalId) => invoke(Invoke.terminalKill, terminalId),
    close: (terminalId) => invoke(Invoke.terminalClose, terminalId),
    list: () => invoke(Invoke.terminalList),
    attach: (terminalId) => invoke(Invoke.terminalAttach, terminalId),
    onData: (cb) => subscribe(Push.terminalData, cb),
    onUpdate: (cb) => subscribe(Push.terminalUpdate, cb),
    onRemoved: (cb) => subscribe(Push.terminalRemoved, cb),
  },
  events: {
    list: (id, limit) => invoke(Invoke.eventsList, id, limit),
    onEvent: (cb) => subscribe(Push.event, cb),
  },
  intent: {
    save: (id, intent) => invoke(Invoke.intentSave, id, intent),
    done: (id, taskId, at) => invoke(Invoke.intentDone, id, taskId, at),
    keep: (id, taskId) => invoke(Invoke.intentKeep, id, taskId),
  },
  changes: {
    get: (id, baseline) => invoke(Invoke.changesGet, id, baseline),
    resetBaseline: (id) => invoke(Invoke.changesResetBaseline, id),
    initRepo: (id) => invoke(Invoke.gitInit, id),
  },
  decisions: {
    list: (id) => invoke(Invoke.decisionsList, id),
    resolve: (id, candidateId, answer) => invoke(Invoke.decisionsResolve, id, candidateId, answer),
  },
  specs: {
    list: (id) => invoke(Invoke.specsList, id),
    resolve: (id, candidateId, answer) => invoke(Invoke.behaviorsResolve, id, candidateId, answer),
    fromIntent: (id, lines, area) => invoke(Invoke.behaviorsFromIntent, id, lines, area),
  },
  analysis: { onStatus: (cb) => subscribe(Push.analysisStatus, cb) },
  rules: {
    freezeBaseline: (id) => invoke(Invoke.rulesFreezeBaseline, id),
    onCheckStatus: (cb) => subscribe(Push.checkStatus, cb),
  },
  templates: {
    plan: (id) => invoke(Invoke.templatesPlan, id),
    apply: (id, paths) => invoke(Invoke.templatesApply, id, paths),
  },
  health: { get: (id) => invoke(Invoke.healthGet, id) },
  menu: { onCommand: (cb) => subscribe(Push.menuCommand, cb) },
}

contextBridge.exposeInMainWorld('trellis', api)
