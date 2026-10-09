import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import type { MenuCommand } from '@shared/ipc'
import { translate } from '@shared/i18n'
import type { Language } from '@shared/types'

export function buildAppMenu(lang: Language, send: (command: MenuCommand) => void): void {
  const t = (key: string): string => translate(lang, key)
  const isMac = process.platform === 'darwin'
  // On Windows/Linux, Ctrl+C must reach the terminal as SIGINT, so edit shortcuts are shown but
  // not registered; the renderer handles copy/paste itself.
  const editAccel = !isMac ? { registerAccelerator: false } : {}

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about', label: t('menu.about') },
              { type: 'separator' },
              {
                label: t('menu.settings'),
                accelerator: 'Cmd+,',
                click: () => send('open-settings'),
              },
              { type: 'separator' },
              { role: 'hide', label: t('menu.hide') },
              { role: 'hideOthers', label: t('menu.hideOthers') },
              { role: 'unhide', label: t('menu.showAll') },
              { type: 'separator' },
              { role: 'quit', label: t('menu.quit') },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: t('menu.file'),
      submenu: [
        {
          label: t('menu.openFolder'),
          accelerator: 'CmdOrCtrl+O',
          click: () => send('open-folder'),
        },
        ...(!isMac
          ? ([
              { type: 'separator' },
              {
                label: t('menu.settings'),
                accelerator: 'Ctrl+,',
                click: () => send('open-settings'),
              },
              { type: 'separator' },
              { role: 'quit', label: t('menu.quit') },
            ] satisfies MenuItemConstructorOptions[])
          : []),
      ],
    },
    {
      label: t('menu.edit'),
      submenu: [
        { role: 'undo', label: t('menu.undo'), ...editAccel },
        { role: 'redo', label: t('menu.redo'), ...editAccel },
        { type: 'separator' },
        { role: 'cut', label: t('menu.cut'), ...editAccel },
        { role: 'copy', label: t('menu.copy'), ...editAccel },
        { role: 'paste', label: t('menu.paste'), ...editAccel },
        { role: 'selectAll', label: t('menu.selectAll'), ...editAccel },
      ],
    },
    {
      label: t('menu.view'),
      submenu: [
        {
          label: t('menu.toggleLeft'),
          accelerator: 'CmdOrCtrl+B',
          click: () => send('toggle-left'),
        },
        {
          label: t('menu.toggleRight'),
          accelerator: 'CmdOrCtrl+Alt+B',
          click: () => send('toggle-right'),
        },
        { type: 'separator' },
        { role: 'resetZoom', label: t('menu.resetZoom') },
        { role: 'zoomIn', label: t('menu.zoomIn') },
        { role: 'zoomOut', label: t('menu.zoomOut') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t('menu.fullscreen') },
        ...(!app.isPackaged
          ? ([
              { type: 'separator' },
              { role: 'reload' },
              { role: 'toggleDevTools' },
            ] satisfies MenuItemConstructorOptions[])
          : []),
      ],
    },
    {
      label: 'Claude',
      submenu: [
        {
          label: t('menu.claudeContinue'),
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => send('claude-continue'),
        },
        {
          label: t('menu.claudeNew'),
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => send('claude-new'),
        },
        {
          label: t('menu.claudeNewTab'),
          accelerator: 'CmdOrCtrl+T',
          click: () => send('claude-new-tab'),
        },
      ],
    },
    {
      label: t('menu.window'),
      submenu: [
        { role: 'minimize', label: t('menu.minimize') },
        { role: 'zoom', label: t('menu.zoom') },
        ...(isMac
          ? ([
              { type: 'separator' },
              { role: 'front', label: t('menu.front') },
            ] satisfies MenuItemConstructorOptions[])
          : []),
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
