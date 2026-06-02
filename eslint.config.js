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
  { type: 'engine', pattern: 'engine/**' },
  { type: 'bridge', pattern: 'bridge/**' },
  { type: 'editor', pattern: 'editor/**' },
  { type: 'app', pattern: 'app/**' },
]

const layerRules = [
  { from: { type: 'core' }, disallow: { to: { type: '*' } } },
  { from: { type: 'storage' }, allow: { to: { type: 'core' } } },
  { from: { type: 'engine' }, allow: { to: { type: ['core', 'storage'] } } },
  { from: { type: 'bridge' }, allow: { to: { type: ['core', 'storage', 'engine'] } } },
  { from: { type: 'editor' }, allow: { to: { type: ['core', 'storage', 'engine', 'bridge'] } } },
  {
    from: { type: 'app' },
    allow: { to: { type: ['core', 'storage', 'engine', 'bridge', 'editor'] } },
  },
]

export default tseslint.config(
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
        'engine/**',
        'bridge/**',
        'editor/**',
        'app/**',
      ],
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

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
      'max-lines-per-function': [
        'warn',
        { max: 40, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-params': ['warn', 3],
      complexity: ['warn', 10],
      'max-depth': ['warn', 3],
      'no-nested-ternary': 'error',
      'no-magic-numbers': [
        'warn',
        { ignore: [-1, 0, 1, 2, 100], ignoreArrayIndexes: true, enforceConst: true },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Unused
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
      ],

      // Layer boundaries
      'boundaries/dependencies': ['error', { default: 'disallow', rules: layerRules }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      'no-magic-numbers': 'off',
      'max-lines-per-function': ['warn', { max: 120, skipBlankLines: true, skipComments: true }],
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
)
