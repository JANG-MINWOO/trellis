// Fails when ko.json and en.json do not have the same keys (plural suffixes are normalized,
// because Korean only has the "other" plural form).
import { readFileSync } from 'node:fs'
import path from 'node:path'

const dir = path.join(process.cwd(), 'src', 'shared', 'locales')
const load = (lang) => JSON.parse(readFileSync(path.join(dir, `${lang}.json`), 'utf8'))

function keys(obj, prefix = '') {
  const out = new Set()
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') for (const sub of keys(v, key)) out.add(sub)
    else out.add(key.replace(/_(zero|one|two|few|many|other)$/, ''))
  }
  return out
}

const ko = keys(load('ko'))
const en = keys(load('en'))
const missingInEn = [...ko].filter((k) => !en.has(k))
const missingInKo = [...en].filter((k) => !ko.has(k))
if (missingInEn.length || missingInKo.length) {
  if (missingInEn.length) console.error(`Missing in en.json:\n  ${missingInEn.join('\n  ')}`)
  if (missingInKo.length) console.error(`Missing in ko.json:\n  ${missingInKo.join('\n  ')}`)
  process.exit(1)
}
console.log(`i18n: ${ko.size} keys in sync`)
