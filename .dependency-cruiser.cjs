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
      comment: 'src/shared is used by main and renderer: no app layers, electron or react.',
      from: { path: '^src/shared/' },
      to: { path: '^(src/(main|preload|renderer)/|node_modules/(electron|react|react-dom)/)' },
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
      name: 'renderer-not-to-main',
      severity: 'error',
      comment: 'The renderer talks to main only through window.trellis.',
      from: { path: '^src/renderer/' },
      to: { path: '^src/(main|preload)/' },
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
