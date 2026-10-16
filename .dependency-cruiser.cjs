/**
 * Structure rules for Trellis. These enforce AGENTS.md §4 so the layout cannot drift silently.
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make features impossible to reason about in isolation.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'shared-is-pure',
      severity: 'error',
      comment:
        'src/shared is plain TypeScript used by main and renderer: no app layers, no packages.',
      from: { path: '^src/shared/' },
      to: { path: '^(src/(main|preload|renderer)/|node_modules/)' },
    },
    {
      name: 'shared-no-node-builtins',
      severity: 'error',
      comment: 'src/shared must run in the sandboxed renderer too.',
      from: { path: '^src/shared/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'main-not-to-ui',
      severity: 'error',
      from: { path: '^src/main/' },
      to: { path: '^src/(renderer|preload)/' },
    },
    {
      name: 'preload-only-shared',
      severity: 'error',
      from: { path: '^src/preload/' },
      to: { path: '^src/(main|renderer)/' },
    },
    {
      name: 'preload-no-node-builtins',
      severity: 'error',
      comment: 'The preload runs sandboxed; it only bridges electron IPC.',
      from: { path: '^src/preload/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'main-infrastructure-is-leaf',
      severity: 'error',
      comment: 'lib/ and platform/ are used by features, never the other way round.',
      from: { path: '^src/main/(lib|platform)/' },
      to: { path: '^src/main/(?!(lib|platform)/)' },
    },
    {
      name: 'renderer-not-to-main',
      severity: 'error',
      comment: 'The renderer talks to main only through window.trellis.',
      from: { path: '^src/renderer/' },
      to: { path: '^src/(main|preload)/' },
    },
    {
      name: 'renderer-no-electron',
      severity: 'error',
      from: { path: '^src/renderer/' },
      to: { path: '^node_modules/electron/' },
    },
    {
      name: 'renderer-parts-are-generic',
      severity: 'error',
      comment: 'lib/ and components/ are shared building blocks; they know no feature or screen.',
      from: { path: '^src/renderer/(lib|components)/' },
      to: { path: '^src/renderer/(features|app)/' },
    },
    {
      name: 'renderer-no-node-builtins',
      severity: 'error',
      comment: 'The renderer is sandboxed.',
      from: { path: '^src/renderer/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'feature-internals-are-private',
      severity: 'error',
      comment: 'Use another feature only through its index.ts.',
      from: { path: '^src/(main|renderer)/features/([^/]+)/' },
      to: { path: '^src/$1/features/(?!$2/)[^/]+/(?!index\\.tsx?$)' },
    },
    {
      name: 'feature-internals-are-private-outside-features',
      severity: 'error',
      comment:
        'App wiring (index.ts, ipc, app/, state/…) also uses a feature only through its index.',
      from: { path: '^src/(main|renderer)/(?!features/)' },
      to: { path: '^src/$1/features/[^/]+/(?!index\\.tsx?$)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.test\\.ts$' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
}
