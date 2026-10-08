// Single source of UI strings for main and renderer (AGENTS.md §6).
import en from './locales/en.json'
import ko from './locales/ko.json'
import type { Language } from './types'

export const resources = { ko, en } as const
export type MessageKey = string

export function detectLanguage(locale: string): Language {
  return locale.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

/** Minimal translator for the main process (menus, dialogs). The renderer uses i18next. */
export function translate(
  lang: Language,
  key: MessageKey,
  vars: Record<string, string | number> = {},
): string {
  const lookup = (table: unknown): string | undefined => {
    let node: unknown = table
    for (const part of key.split('.')) {
      if (node && typeof node === 'object' && part in node)
        node = (node as Record<string, unknown>)[part]
      else return undefined
    }
    return typeof node === 'string' ? node : undefined
  }
  const template = lookup(resources[lang]) ?? lookup(resources.en) ?? key
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String(vars[name] ?? `{{${name}}}`),
  )
}
