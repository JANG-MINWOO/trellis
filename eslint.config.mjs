import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/** Hook payload fields Claude Code owns (snake_case, so they never collide with our names). */
const CLAUDE_FIELDS = [
  'hook_event_name',
  'stop_hook_active',
  'notification_type',
  'tool_name',
  'tool_input',
  'session_id',
  'prompt_id',
  'last_assistant_message',
]
const CLAUDE_NAMES = [
  ...CLAUDE_FIELDS,
  'permission_prompt',
  'elicitation_dialog',
  'agent_needs_input',
  '--permission-mode',
  '--dangerously-skip-permissions',
  '--settings',
  '--json-schema',
  '--continue',
  '--session-id',
  '--restricted',
  '--strict-mcp-config',
]

export default defineConfig(
  {
    ignores: [
      'out/**',
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      'src/main/**/*.ts',
      'src/preload/**/*.ts',
      'scripts/**/*.mjs',
      'tests/**/*.{ts,mjs}',
      '*.{js,mjs,cjs,ts}',
    ],
    languageOptions: { globals: globals.node },
  },
  // AGENTS.md §5: OS branches live in src/main/platform/, processes get argv arrays.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/main/platform/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'platform',
          message: 'Use the helpers in src/main/platform/ (AGENTS.md §5).',
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        ...['node:child_process', 'child_process'].map((name) => ({
          name,
          importNames: ['exec', 'execSync'],
          message:
            'Run processes with argv arrays (execFile/spawn), never a shell string (AGENTS.md §5).',
        })),
      ],
    },
  },
  // AGENTS.md §7: Claude Code's hook fields and CLI flags stay inside its adapter.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/main/features/agents/claude-code/**', '**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=/^(${CLAUDE_NAMES.join('|')})$/]`,
          message: 'Claude Code specifics belong in src/main/features/agents/claude-code/.',
        },
        {
          selector: `Identifier[name=/^(${CLAUDE_FIELDS.join('|')})$/]`,
          message: 'Claude Code specifics belong in src/main/features/agents/claude-code/.',
        },
      ],
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
)
