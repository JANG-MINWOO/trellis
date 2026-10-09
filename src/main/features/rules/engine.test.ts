import { describe, expect, it } from 'vitest'
import { defaultRulesConfig, parseRulesConfig, stripJsonc } from './config'
import { analyze, stronglyConnected, type AnalyzedFile } from './engine'
import { extractFacts } from './facts'
import { createResolver } from './resolve'

const file = (path: string, text: string): AnalyzedFile => ({
  path,
  size: text.length,
  facts: extractFacts(path, text),
})

function run(
  files: AnalyzedFile[],
  configText: string | null = null,
  tsconfigs: { path: string; text: string }[] = [],
) {
  const { config } = parseRulesConfig(configText)
  const resolve = createResolver({
    files: files.map((f) => f.path),
    tsconfigs,
    aliases: config.aliases,
  })
  return analyze(files, config, resolve, (p) => p.endsWith('.md') && !p.includes('worklog'))
}

describe('facts', () => {
  it('extracts imports per language', () => {
    expect(
      extractFacts(
        'a.ts',
        `import x from './x'\nimport type { T } from "../t"\nexport * from './e'\nimport {\n  a,\n  b,\n} from '@shared/m'\nconst y = require('./y')\nawait import('./z')\n`,
      ).imports,
    ).toEqual(['./x', '../t', './e', '@shared/m', './y', './z'])
    expect(
      extractFacts('p/a.py', 'import os, pkg.mod\nfrom . import sib\nfrom ..up import thing\n')
        .imports,
    ).toEqual(['os', 'pkg.mod', '.', '.sib', '..up', '..up.thing'])
    expect(
      extractFacts('a.gd', 'extends "res://base.gd"\nvar s = preload("res://ui/s.gd")\n').imports,
    ).toEqual(['res://base.gd', 'res://ui/s.gd'])
    expect(
      extractFacts('A.java', 'import com.acme.Foo;\nimport static com.acme.Bar.baz;\n').imports,
    ).toEqual(['com.acme.Foo', 'com.acme.Bar.baz'])
    expect(extractFacts('run.sh', 'source ./lib.sh\n. "$HOME/x"\n').imports).toEqual(['./lib.sh'])
  })

  it('collects doc refs outside code fences', () => {
    const refs = extractFacts(
      'README.md',
      'See [plan](docs/PLAN.md) and `src/main/`.\n```\n`src/ignored.ts`\n```\n',
    ).refs
    expect(refs.map((r) => [r.kind, r.target, r.line])).toEqual([
      ['link', 'docs/PLAN.md', 1],
      ['code', 'src/main/', 1],
    ])
  })
})

describe('config', () => {
  it('reads JSONC without touching strings', () => {
    expect(JSON.parse(stripJsonc('{"a": "@x/*", // c\n /* b */ "b": [1,],}'))).toEqual({
      a: '@x/*',
      b: [1],
    })
    const { config, error } = parseRulesConfig(
      '{"maxLines": 200, "duplicates": false, "boundaries": [{"from": "src/ui/**", "disallow": ["src/db/**"]}, {"from": "x"}]}',
    )
    expect(error).toBeNull()
    expect(config).toMatchObject({ maxLines: 200, duplicates: null, cycles: true })
    expect(config.boundaries).toHaveLength(1)
    expect(parseRulesConfig('{oops').error).toBeTruthy()
    expect(parseRulesConfig(null).config).toEqual(defaultRulesConfig())
  })
})

describe('resolver', () => {
  it('resolves relative, tsconfig paths and .js specifiers to TS files', () => {
    const resolve = createResolver({
      files: [
        'src/a.ts',
        'src/b/index.tsx',
        'src/shared/types.ts',
        'src/c.ts',
        'pkg/__init__.py',
        'pkg/mod.py',
        'game/project.godot',
        'game/ui/s.gd',
        'src/com/acme/Foo.java',
      ],
      tsconfigs: [
        {
          path: 'tsconfig.json',
          text: '{ "compilerOptions": { /* x */ "paths": { "@shared/*": ["src/shared/*"] } } }',
        },
      ],
      aliases: {},
    })
    expect(resolve('src/a.ts', './b', 'ts')).toBe('src/b/index.tsx')
    expect(resolve('src/a.ts', './c.js', 'ts')).toBe('src/c.ts')
    expect(resolve('src/a.ts', '@shared/types', 'ts')).toBe('src/shared/types.ts')
    expect(resolve('src/a.ts', 'react', 'ts')).toBeNull()
    expect(resolve('x.py', 'pkg.mod', 'py')).toBe('pkg/mod.py')
    expect(resolve('pkg/mod.py', '.', 'py')).toBe('pkg/__init__.py')
    expect(resolve('game/main.gd', 'res://ui/s.gd', 'gd')).toBe('game/ui/s.gd')
    expect(resolve('B.java', 'com.acme.Foo', 'java')).toBe('src/com/acme/Foo.java')
  })
})

describe('analyze', () => {
  it('finds long files, crowded folders, cycles and boundary breaks', () => {
    const long = Array.from({ length: 12 }, (_, i) => `const v${i} = ${i}`).join('\n')
    const result = run(
      [
        file('src/ui/view.ts', `import { q } from '../db/query'\nimport { a } from './a'\n${long}`),
        file('src/ui/a.ts', "import { v } from './view'\nexport const a = 1\n"),
        file('src/db/query.ts', 'export const q = 1\n'),
        ...Array.from({ length: 3 }, (_, i) => file(`src/many/f${i}.ts`, 'export {}\n')),
      ],
      '{"maxLines": 10, "maxFilesPerFolder": 2, "boundaries": [{"from": "src/ui/**", "disallow": ["src/db/**"], "message": "UI must go through services"}]}',
    )
    const byRule = (rule: string) => result.violations.filter((v) => v.rule === rule)
    expect(byRule('max-lines').map((v) => [v.path, v.size])).toEqual([['src/ui/view.ts', 14]])
    expect(byRule('folder-size').map((v) => [v.path, v.size])).toEqual([['src/many', 3]])
    expect(byRule('cycle').map((v) => v.fingerprint)).toEqual(['cycle:src/ui/a.ts|src/ui/view.ts'])
    expect(byRule('boundary')).toEqual([
      expect.objectContaining({
        path: 'src/ui/view.ts',
        related: ['src/db/query.ts'],
        message: 'UI must go through services',
      }),
    ])
  })

  it('finds duplicated blocks across files, not boilerplate', () => {
    const block = Array.from(
      { length: 14 },
      (_, i) => `total = total + price${i} * quantity${i}`,
    ).join('\n')
    const result = run([
      file('src/a.ts', `// license header line one\n${block}\n`),
      file('src/b.ts', `function other() {}\n${block}\n`),
      file('src/c.ts', 'import a from "./a"\n}\n})\n'),
    ])
    const dups = result.violations.filter((v) => v.rule === 'duplicate')
    expect(dups.map((v) => [v.fingerprint, v.size])).toEqual([['duplicate:src/a.ts|src/b.ts', 14]])
  })

  it('reports doc paths that point nowhere, only in living docs', () => {
    const result = run([
      file('src/main/index.ts', 'export {}\n'),
      file(
        'README.md',
        'Run `src/main/index.ts`, see `src/main/old.ts`, [gone](docs/gone.md), [web](https://x.y), `ko/en`, `src/*.ts`, `src/empty/`, `src/main/…`, `[t](example.md)`\n',
      ),
      file('docs/worklog/old.md', '`src/main/old.ts`\n'),
    ])
    expect(result.drift.map((d) => d.target).sort()).toEqual(['docs/gone.md', 'src/main/old.ts'])
  })

  it('handles self loops and long chains in the cycle finder', () => {
    const edges = new Map<string, string[]>()
    for (let i = 0; i < 5000; i++) edges.set(`f${i}`, [`f${i + 1}`])
    edges.set('f5000', ['f0'])
    expect(stronglyConnected(edges)[0]).toHaveLength(5001)
  })
})
