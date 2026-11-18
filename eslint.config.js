import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import boundaries from 'eslint-plugin-boundaries'
import unusedImports from 'eslint-plugin-unused-imports'
import globals from 'globals'

const layerElements = [
  { type: 'core', pattern: 'core/**' },
  { type: 'storage', pattern: 'storage/**' },
  { type: 'session', pattern: 'session/**' },
  { type: 'engine', pattern: 'engine/**' },
  { type: 'bridge', pattern: 'bridge/**' },
  { type: 'editor', pattern: 'editor/**' },
  { type: 'app', pattern: 'app/**' },
]

const layerRules = [
  // core sits at the bottom of the layer stack: it may import nothing above it.
  { from: { type: 'core' }, disallow: { to: { type: '*' } } },
  { from: { type: 'storage' }, allow: { to: { type: 'core' } } },
  { from: { type: 'session' }, allow: { to: { type: ['core', 'storage'] } } },
  { from: { type: 'engine' }, allow: { to: { type: 'core' } } },
  {
    from: { type: 'bridge' },
    allow: { to: { type: ['core', 'storage', 'session', 'engine'] } },
  },
  {
    from: { type: 'editor' },
    allow: { to: { type: ['core', 'storage', 'session', 'bridge'] } },
  },
  {
    from: { type: 'app' },
    allow: { to: { type: ['core', 'storage', 'session', 'engine', 'bridge', 'editor'] } },
  },
]

const reactPackages = {
  regex: '^(react|react-dom)(/.*)?$|^@react-three/',
  message: 'This layer does not import React (ADR-0001).',
}
const threePackages = {
  regex: '^three(/.*)?$',
  message: 'Only engine/ imports Three.js (ADR-0001).',
}
const reactThreePackages = {
  regex: '^@react-three/',
  message: 'Only bridge/ imports @react-three (ADR-0001).',
}

const engineTestingMessage = 'The engine testing entry is for tests only.'
const engineTestingEntry = { regex: '(^|/)engine/testing(/.*)?$', message: engineTestingMessage }
// Inside engine/ a relative ./testing or ../testing can be the entry itself, so this pattern adds the relative form to the path form.
const engineTestingEntryInsideEngine = {
  regex: '(^|/)engine/testing(/.*)?$|^\\.{1,2}/(\\.\\./)*testing(/.*)?$',
  message: engineTestingMessage,
}
const testFileGlobs = ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/*-contract.ts']

const nodeGlobalNames = new Set(Object.keys(globals.node))
const browserOnlyGlobalNames = Object.keys(globals.browser).filter(
  (name) => !nodeGlobalNames.has(name),
)
const browserOnlyGlobalsFor = (layerName) =>
  browserOnlyGlobalNames.map((name) => ({
    name,
    message: `${layerName}/ uses no global that exists only in a browser.`,
  }))

const layerPurityBlocks = [
  {
    files: ['core/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [reactPackages, threePackages] }] },
  },
  {
    // Shipped core/ code must run with no browser. The unit tests of core/ run
    // under jsdom and may use the DOM to check output, so they are left out.
    files: ['core/**'],
    ignores: ['core/**/*.test.ts', 'core/**/*.test.tsx'],
    rules: { 'no-restricted-globals': ['error', ...browserOnlyGlobalsFor('core')] },
  },
  {
    files: ['session/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [reactPackages, threePackages] }] },
  },
  {
    // Shipped session/ code is as free of the browser as core/ is. Its unit
    // tests run under jsdom and may use the DOM to check output, so they are left out.
    files: ['session/**'],
    ignores: ['session/**/*.test.ts', 'session/**/*.test.tsx'],
    rules: { 'no-restricted-globals': ['error', ...browserOnlyGlobalsFor('session')] },
  },
  {
    files: ['storage/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [reactPackages, threePackages] }] },
  },
  {
    files: ['engine/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [reactPackages] }] },
  },
  {
    files: ['bridge/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [threePackages] }] },
  },
  {
    files: ['editor/**', 'app/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [threePackages, reactThreePackages] }],
    },
  },
  {
    // Later blocks replace the rule's options, so these repeat the layer patterns.
    files: ['bridge/**'],
    ignores: testFileGlobs,
    rules: {
      'no-restricted-imports': ['error', { patterns: [threePackages, engineTestingEntry] }],
    },
  },
  {
    files: ['editor/**', 'app/**'],
    ignores: testFileGlobs,
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [threePackages, reactThreePackages, engineTestingEntry] },
      ],
    },
  },
  {
    files: ['src/**'],
    ignores: testFileGlobs,
    rules: { 'no-restricted-imports': ['error', { patterns: [engineTestingEntry] }] },
  },
  {
    // Files inside engine/testing/ import their siblings, so they are left out.
    // Test support modules (named *-test-support) only serve tests, so they are left out too.
    files: ['engine/**'],
    ignores: [...testFileGlobs, 'engine/testing/**', '**/*-test-support.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [reactPackages, engineTestingEntryInsideEngine] },
      ],
    },
  },
]

/** @typedef {{ file: string, rule: string, issue: number, max?: number }} LintException */

/**
 * The only place in this config where a limit is raised or a rule is turned
 * off for a file. Inline disable comments with a reason stay allowed (ADR-0185).
 * Each entry names the issue that removes it; a size-rule entry caps the file
 * at its measured value.
 *
 * @type {LintException[]}
 */
export const lintExceptions = [
  { file: 'app/app.test.tsx', rule: 'max-lines', issue: 685, max: 434 },
  { file: 'app/use-project-actions.test.ts', rule: 'max-lines', issue: 685, max: 410 },
  {
    file: 'bridge/autosave/create-autosave.test.ts',
    rule: 'max-lines-per-function',
    issue: 685,
    max: 223,
  },
  {
    file: 'core/commands/handlers/furniture-commands.test.ts',
    rule: 'max-lines',
    issue: 686,
    max: 335,
  },
  {
    file: 'core/commands/handlers/opening-commands.test.ts',
    rule: 'max-lines',
    issue: 686,
    max: 371,
  },
  {
    file: 'core/commands/handlers/opening-commands.test.ts',
    rule: 'complexity',
    issue: 686,
    max: 23,
  },
  {
    file: 'core/topology/wall-footprint.test.ts',
    rule: 'max-lines-per-function',
    issue: 687,
    max: 152,
  },
  { file: 'engine/scene/wall-builder.test.ts', rule: 'max-lines', issue: 687, max: 356 },
  { file: 'editor/shell/inspector.tsx', rule: 'max-lines', issue: 688, max: 427 },
  { file: 'editor/shell/inspector.tsx', rule: 'max-lines-per-function', issue: 688, max: 87 },
  { file: 'editor/shell/inspector.tsx', rule: 'complexity', issue: 688, max: 11 },
  { file: 'editor/plan/hit-test.test.ts', rule: 'max-lines', issue: 688, max: 307 },
  {
    file: 'bridge/react/framed-scene.test.ts',
    rule: 'max-lines-per-function',
    issue: 689,
    max: 283,
  },
  { file: 'bridge/react/scene-nav-toolbar.test.tsx', rule: 'max-lines', issue: 689, max: 378 },
  {
    file: 'bridge/react/scene-selection.tsx',
    rule: 'react-refresh/only-export-components',
    issue: 689,
  },
  {
    file: 'engine/scene/near-wall-transparency.test.ts',
    rule: 'max-lines',
    issue: 689,
    max: 451,
  },
  {
    file: 'engine/scene/near-wall-transparency.test.ts',
    rule: 'max-lines-per-function',
    issue: 689,
    max: 155,
  },
  { file: 'editor/plan/draw-plan.test.ts', rule: 'max-lines-per-function', issue: 690, max: 168 },
  {
    file: 'editor/plan/draw-underlay.test.ts',
    rule: 'max-lines-per-function',
    issue: 690,
    max: 165,
  },
  {
    file: 'editor/plan/use-plan-authoring.test.ts',
    rule: 'max-lines-per-function',
    issue: 691,
    max: 201,
  },
  { file: 'editor/shell/editor-shell.test.tsx', rule: 'max-lines', issue: 691, max: 410 },
  {
    file: 'editor/shell/editor-shell.test.tsx',
    rule: 'max-lines-per-function',
    issue: 691,
    max: 351,
  },
  {
    file: 'editor/design-system/notifications/use-notifications.tsx',
    rule: 'react-refresh/only-export-components',
    issue: 692,
  },
  {
    file: 'editor/design-system/design-system.stories.tsx',
    rule: 'max-lines',
    issue: 500,
    max: 347,
  },
  {
    file: 'editor/design-system/design-system.stories.tsx',
    rule: 'max-lines-per-function',
    issue: 500,
    max: 235,
  },
]

const lengthOptions = { skipBlankLines: true, skipComments: true }
const functionLengthOptions = { ...lengthOptions, IIFEs: true }
// Test, spec, contract, and story files carry their own function-length options.
const relaxedFunctionLengthFile = /\.(test|spec|stories)\.tsx?$|-contract\.ts$/

/** The rule's standard options with only the limit replaced by `max`. */
function sizeRuleSetting(rule, max, file) {
  switch (rule) {
    case 'max-lines':
      return ['error', { ...lengthOptions, max }]
    case 'max-lines-per-function':
      return [
        'error',
        relaxedFunctionLengthFile.test(file)
          ? { ...lengthOptions, max }
          : { ...functionLengthOptions, max },
      ]
    default:
      return ['error', max]
  }
}

/** @param {LintException} exception */
function exceptionBlock({ file, rule, max }) {
  const setting = max === undefined ? 'off' : sizeRuleSetting(rule, max, file)
  return { files: [file], rules: { [rule]: setting } }
}

/** @param {LintException[]} exceptions */
export function buildConfig(exceptions = lintExceptions) {
  return tseslint.config(
    { linterOptions: { reportUnusedDisableDirectives: 'error' } },
    {
      ignores: [
        'dist',
        'coverage',
        'node_modules',
        '.superpowers',
        'pnpm-lock.yaml',
        'storybook-static',
        'playwright-report',
        'test-results',
        'e2e/.cache',
        '.lighthouseci',
        'reports',
        '.stryker-tmp',
        '.claude/worktrees',
        // generated by msw, not authored here
        'public/mockServiceWorker.js',
        // standalone validators generated with the schema (`pnpm schema:generate`)
        'core/format/generated',
        // emitted by `tsc -b` from the tsconfig.node.json composite project
        'vite.config.js',
        'vite.config.d.ts',
        'vitest.config.js',
        'vitest.config.d.ts',
      ],
    },
    {
      files: ['**/*.{ts,tsx}'],
      extends: [js.configs.recommended, ...tseslint.configs.recommended],
      languageOptions: {
        ecmaVersion: 2022,
        globals: globals.browser,
      },
      plugins: {
        'react-hooks': reactHooks,
        'react-refresh': reactRefresh,
        boundaries,
        'unused-imports': unusedImports,
      },
      settings: {
        'boundaries/elements': layerElements,
        'import/resolver': { node: { extensions: ['.ts', '.tsx', '.js', '.jsx'] } },
        'boundaries/include': [
          'core/**',
          'storage/**',
          'session/**',
          'engine/**',
          'bridge/**',
          'editor/**',
          'app/**',
        ],
      },
      rules: {
        ...reactHooks.configs.recommended.rules,
        'react-hooks/exhaustive-deps': 'error',
        'react-refresh/only-export-components': ['error', { allowConstantExport: true }],

        // Naming
        '@typescript-eslint/naming-convention': [
          'error',
          { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
          { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
          { selector: 'function', format: ['camelCase', 'PascalCase'] },
          { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
          { selector: 'typeLike', format: ['PascalCase'] },
          { selector: 'enumMember', format: ['UPPER_CASE', 'PascalCase'] },
          { selector: 'import', format: ['camelCase', 'PascalCase'] },
        ],

        // Size and shape limits
        'max-lines-per-function': ['error', { ...functionLengthOptions, max: 40 }],
        'max-lines': ['error', { ...lengthOptions, max: 300 }],
        'max-params': ['error', 3],
        complexity: ['error', 10],
        'max-depth': ['error', 3],
        'no-nested-ternary': 'error',
        'no-magic-numbers': [
          'error',
          { ignore: [-1, 0, 1, 2, 100], ignoreArrayIndexes: true, enforceConst: true },
        ],
        'no-console': ['error', { allow: ['warn', 'error'] }],

        // Unused
        'unused-imports/no-unused-imports': 'error',
        'unused-imports/no-unused-vars': [
          'error',
          { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
        ],

        // Layer boundaries
        'boundaries/dependencies': ['error', { default: 'disallow', rules: layerRules }],
      },
    },
    {
      files: testFileGlobs,
      rules: {
        'no-magic-numbers': 'off',
        'max-lines-per-function': ['error', { ...lengthOptions, max: 120 }],
      },
    },
    {
      // Stories double as component tests: their render scaffolding and `play`
      // interactions carry literal layout values and longer bodies, the same way
      // test files do. Relax the same rules the test override relaxes.
      files: ['**/*.stories.{ts,tsx}'],
      rules: {
        'no-magic-numbers': 'off',
        'max-lines-per-function': ['error', { ...lengthOptions, max: 120 }],
      },
    },
    {
      files: ['vite.config.ts', 'vitest.config.ts', 'eslint.config.js'],
      languageOptions: {
        ecmaVersion: 2022,
        globals: globals.node,
      },
      rules: {
        'no-magic-numbers': 'off',
      },
    },
    {
      files: ['**/registries/**/*.ts'],
      rules: {
        // Registries are declarative data tables; numeric material parameters are
        // inherent data, not unexplained constants.
        'no-magic-numbers': 'off',
      },
    },
    ...layerPurityBlocks,
    ...exceptions.map(exceptionBlock),
  )
}

export default buildConfig()
