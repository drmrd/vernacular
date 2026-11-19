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
    allow: { to: { type: ['core', 'session', 'engine'] } },
  },
  {
    from: { type: 'editor' },
    allow: { to: { type: ['core', 'session', 'bridge'] } },
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
const sessionTestingMessage = 'The session testing entry is for tests and stories only.'
const sessionTestingEntry = { regex: '(^|/)session/testing(/.*)?$', message: sessionTestingMessage }
// Inside session/ a relative ./testing or ../testing can be the entry itself, so this pattern adds the relative form to the path form.
const sessionTestingEntryInsideSession = {
  regex: '(^|/)session/testing(/.*)?$|^\\.{1,2}/(\\.\\./)*testing(/.*)?$',
  message: sessionTestingMessage,
}
const testFileGlobs = ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/*-contract.ts']
const storyFileGlobs = ['**/*.stories.{ts,tsx}']
const sessionTestingUsers = [...testFileGlobs, ...storyFileGlobs, '**/*-test-support.{ts,tsx}']

// Browser storage APIs are used only inside storage/ (ADR-0180), so every layer
// outside it reaches storage through a port or a store of storage/. The block
// covers shipped code, tests, stories, and test support alike. storage/, e2e/,
// tests/, scripts/, and .storybook/ are not listed, so they keep direct access.
const storageApiNames = [
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'showDirectoryPicker',
  'showOpenFilePicker',
  'showSaveFilePicker',
]
const globalObjectNames = ['window', 'globalThis', 'self']
const navigatorStorageMembers = ['storage', 'locks']
const storageApiMessage =
  'Browser storage APIs are used only inside storage/ (ADR-0180). Reach them through a port or a store of storage/.'
const storageGlobals = storageApiNames.map((name) => ({ name, message: storageApiMessage }))
const storageProperties = [
  ...globalObjectNames.flatMap((object) =>
    storageApiNames.map((property) => ({ object, property, message: storageApiMessage })),
  ),
  ...navigatorStorageMembers.map((property) => ({
    object: 'navigator',
    property,
    message: storageApiMessage,
  })),
]

// Pieces of the selectors below. A name list becomes one regular expression.
const anyOf = (names) => `/^(${names.join('|')})$/`
const propertyNamed = (names) =>
  `:matches([property.name=${anyOf(names)}], [property.value=${anyOf(names)}])`
const keyNamed = (names) => `:matches([key.name=${anyOf(names)}], [key.value=${anyOf(names)}])`
const typeScriptWrapper = anyOf(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression'])
const storageSelector = (selector) => ({ selector, message: storageApiMessage })

// navigator reached through another object: globalThis.navigator.storage
const navigatorThroughAnObject = storageSelector(
  "MemberExpression[object.type='MemberExpression'][object.property.name='navigator']" +
    propertyNamed(navigatorStorageMembers),
)
// A global object behind a TypeScript wrapper: (window as Window).localStorage
const wrappedGlobalObject = storageSelector(
  `MemberExpression[object.type=${typeScriptWrapper}]` +
    `[object.expression.name=${anyOf(globalObjectNames)}]` +
    propertyNamed(storageApiNames),
)
// navigator behind a TypeScript wrapper, direct or read from an object:
// (navigator as Navigator).storage, globalThis.navigator!.locks
const wrappedNavigator = storageSelector(
  `MemberExpression[object.type=${typeScriptWrapper}]` +
    ":matches([object.expression.name='navigator'], [object.expression.property.name='navigator'])" +
    propertyNamed(navigatorStorageMembers),
)
// A destructuring from a navigator read from an object: const { storage } = globalThis.navigator
const destructuredFromNavigatorThroughAnObject = storageSelector(
  "VariableDeclarator[init.type='MemberExpression'][init.property.name='navigator']" +
    ` > ObjectPattern > Property${keyNamed(navigatorStorageMembers)}`,
)
// A destructuring of navigator out of a global object: const { navigator: { storage } } = window
const destructuredNavigatorOfGlobalObject = storageSelector(
  `VariableDeclarator[init.name=${anyOf(globalObjectNames)}]` +
    " > ObjectPattern > Property[key.name='navigator']" +
    ` > ObjectPattern > Property${keyNamed(navigatorStorageMembers)}`,
)
const storageApiBlock = {
  files: ['core/**', 'session/**', 'engine/**', 'bridge/**', 'editor/**', 'app/**', 'src/**'],
  rules: {
    'no-restricted-globals': ['error', ...storageGlobals],
    'no-restricted-properties': ['error', ...storageProperties],
    'no-restricted-syntax': [
      'error',
      navigatorThroughAnObject,
      wrappedGlobalObject,
      wrappedNavigator,
      destructuredFromNavigatorThroughAnObject,
      destructuredNavigatorOfGlobalObject,
    ],
  },
}

const nodeGlobalNames = new Set(Object.keys(globals.node))
const storageApiNameSet = new Set(storageApiNames)
const browserOnlyGlobalNames = Object.keys(globals.browser).filter(
  (name) => !nodeGlobalNames.has(name) && !storageApiNameSet.has(name),
)
// The purity blocks below replace the options of the storage block for shipped
// core/ and session/ files, so their list carries the storage names too.
const browserOnlyGlobalsFor = (layerName) => [
  ...browserOnlyGlobalNames.map((name) => ({
    name,
    message: `${layerName}/ uses no global that exists only in a browser.`,
  })),
  ...storageGlobals,
]

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
    // For a production file of bridge/, editor/, app/, and src/, the later blocks
    // that ignore test and story files replace the options of the blocks that
    // ignore only test files, so these take effect for story files only.
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
    // Tests and stories may use the session doubles; production code may not.
    // Test support modules (named *-test-support) only serve tests, so they are left out too.
    // The earlier blocks still apply to them, so a support module cannot import the 3D packages.
    files: ['bridge/**'],
    ignores: sessionTestingUsers,
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [threePackages, engineTestingEntry, sessionTestingEntry] },
      ],
    },
  },
  {
    files: ['editor/**', 'app/**'],
    ignores: sessionTestingUsers,
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [threePackages, reactThreePackages, engineTestingEntry, sessionTestingEntry] },
      ],
    },
  },
  {
    files: ['src/**'],
    ignores: sessionTestingUsers,
    rules: {
      'no-restricted-imports': ['error', { patterns: [engineTestingEntry, sessionTestingEntry] }],
    },
  },
  {
    // Files inside session/testing/ import their siblings, so they are left out.
    files: ['session/**'],
    ignores: [...testFileGlobs, 'session/testing/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [reactPackages, threePackages, sessionTestingEntryInsideSession] },
      ],
    },
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

/**
 * A rule exception raises a limit or turns a rule off for one file. An import
 * exception lets one file in bridge/ or editor/ import storage/ directly.
 *
 * @typedef {{ file: string, rule: string, issue: number, max?: number }} RuleException
 * @typedef {{ file: string, allowImportOf: 'storage', issue: number }} ImportException
 * @typedef {RuleException | ImportException} LintException
 */

/**
 * The only place in this config where a limit is raised, a rule is turned off,
 * or a layer import is allowed for a file. Inline disable comments with a
 * reason stay allowed (ADR-0185). Each entry names the issue that removes it;
 * a size-rule entry caps the file at its measured value.
 *
 * @type {LintException[]}
 */
export const lintExceptions = [
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
  // Issue #717 moves the asset and library ports behind the session layer.
  { file: 'bridge/react/asset-cache-context.test.tsx', allowImportOf: 'storage', issue: 717 },
  { file: 'bridge/react/asset-cache-context.ts', allowImportOf: 'storage', issue: 717 },
  { file: 'bridge/react/asset-registry-context.test.tsx', allowImportOf: 'storage', issue: 717 },
  { file: 'bridge/react/asset-registry-context.ts', allowImportOf: 'storage', issue: 717 },
  { file: 'bridge/react/use-catalog-names.test.tsx', allowImportOf: 'storage', issue: 717 },
  { file: 'bridge/react/user-asset-source-context.ts', allowImportOf: 'storage', issue: 717 },
  { file: 'bridge/react/webgpu-scene-view.test.tsx', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/commands/editor-commands.test.ts', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/library/library-filter.test.ts', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/library/library-filter.ts', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/library/library-launcher-panel.test.tsx', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/library/library-launcher-panel.tsx', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/library/library-launcher.stories.tsx', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/library/library-launcher.test.tsx', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/library/library-launcher.tsx', allowImportOf: 'storage', issue: 717 },
  {
    file: 'editor/library/library-panel-no-matches.test.tsx',
    allowImportOf: 'storage',
    issue: 717,
  },
  { file: 'editor/library/library-panel.stories.tsx', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/library/library-panel.test.tsx', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/library/library-panel.tsx', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/library/library-test-support.ts', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/library/use-furniture-import.test.ts', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/library/use-furniture-import.ts', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/plan/authoring-tool-handlers.test.ts', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/plan/authoring-tool-handlers.ts', allowImportOf: 'storage', issue: 717 },
  {
    file: 'editor/plan/furniture-placement-context.test.tsx',
    allowImportOf: 'storage',
    issue: 717,
  },
  { file: 'editor/plan/furniture-placement-context.ts', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/plan/use-furniture-layer.ts', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/plan/use-furniture-placement.test.ts', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/plan/use-furniture-placement.ts', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/plan/use-plan-authoring.test.ts', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/plan/use-plan-authoring.ts', allowImportOf: 'storage', issue: 717 },
  { file: 'editor/shell/inspector-selection.test.tsx', allowImportOf: 'storage', issue: 717 },
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

/** The layer rules, with one extra target layer allowed for the layer of `file`. */
function layerRulesAllowing(file, extraTarget) {
  const layer = file.split('/')[0]
  return layerRules.map((layerRule) =>
    layerRule.from.type === layer && layerRule.allow
      ? { ...layerRule, allow: { to: { type: [layerRule.allow.to.type, extraTarget].flat() } } }
      : layerRule,
  )
}

/** @param {ImportException} exception */
function importExceptionBlock({ file, allowImportOf }) {
  return {
    files: [file],
    rules: {
      'boundaries/dependencies': [
        'error',
        { default: 'disallow', rules: layerRulesAllowing(file, allowImportOf) },
      ],
    },
  }
}

/** @param {RuleException} exception */
function ruleExceptionBlock({ file, rule, max }) {
  const setting = max === undefined ? 'off' : sizeRuleSetting(rule, max, file)
  return { files: [file], rules: { [rule]: setting } }
}

/** @param {LintException} exception */
function exceptionBlock(exception) {
  return 'allowImportOf' in exception
    ? importExceptionBlock(exception)
    : ruleExceptionBlock(exception)
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
        'boundaries/include': layerElements.map(({ pattern }) => pattern),
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
      files: storyFileGlobs,
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
    storageApiBlock,
    ...layerPurityBlocks,
    ...exceptions.map(exceptionBlock),
  )
}

export default buildConfig()
