// @vitest-environment node
// ESLint's lintText reads files through Node's fs module, which needs the node environment, not the project-wide jsdom.
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// One shared instance: building the flat config is the expensive part. Linting is
// CPU-bound, so allow extra time over Vitest's 5s per-test default.
const eslint = new ESLint()
const LINT_TIMEOUT_MS = 30_000

const IMPORT_RULE = 'no-restricted-imports'
const GLOBAL_RULE = 'no-restricted-globals'

interface ImportCase {
  readonly filePath: string
  readonly specifier: string
  readonly statement?: 'type-import' | 'reexport'
}

async function purityRuleIds(code: string, filePath: string): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(code, { filePath })
  const purityRules = [IMPORT_RULE, GLOBAL_RULE]
  return (result?.messages ?? [])
    .map((message) => message.ruleId)
    .filter((ruleId) => ruleId !== null && purityRules.includes(ruleId))
}

async function globalRuleMessages(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath })
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === GLOBAL_RULE)
    .map((message) => message.message)
}

function importSample(specifier: string, statement?: ImportCase['statement']): string {
  if (statement === 'type-import') {
    return `import type { Imported } from '${specifier}'\nexport type Value = Imported\n`
  }
  if (statement === 'reexport') {
    return `export * from '${specifier}'\n`
  }
  return `import * as imported from '${specifier}'\nexport const value = imported\n`
}

function globalSample(name: string): string {
  return `export const value = ${name}\n`
}

const rejectedImports: readonly ImportCase[] = [
  { filePath: 'core/sample.ts', specifier: 'react' },
  { filePath: 'core/sample.ts', specifier: 'react/jsx-runtime' },
  { filePath: 'core/sample.ts', specifier: 'react-dom/client' },
  { filePath: 'core/sample.ts', specifier: 'three' },
  { filePath: 'core/sample.ts', specifier: 'three/addons/controls/OrbitControls.js' },
  { filePath: 'core/sample.ts', specifier: '@react-three/drei' },
  { filePath: 'session/sample.ts', specifier: 'react' },
  { filePath: 'session/sample.ts', specifier: 'react-dom/client' },
  { filePath: 'session/sample.ts', specifier: '@react-three/fiber' },
  { filePath: 'session/sample.ts', specifier: 'three' },
  { filePath: 'storage/sample.ts', specifier: 'react' },
  { filePath: 'storage/sample.ts', specifier: 'react-dom' },
  { filePath: 'storage/sample.ts', specifier: 'three' },
  { filePath: 'storage/sample.ts', specifier: 'three/addons/loaders/GLTFLoader.js' },
  { filePath: 'engine/sample.ts', specifier: 'react' },
  { filePath: 'engine/sample.ts', specifier: 'react/jsx-runtime' },
  { filePath: 'engine/sample.ts', specifier: 'react-dom/client' },
  { filePath: 'engine/sample.ts', specifier: '@react-three/fiber' },
  { filePath: 'bridge/sample.tsx', specifier: 'three' },
  { filePath: 'bridge/sample.tsx', specifier: 'three/addons/controls/OrbitControls.js' },
  { filePath: 'editor/sample.tsx', specifier: 'three' },
  { filePath: 'editor/sample.tsx', specifier: 'three/addons/controls/OrbitControls.js' },
  { filePath: 'editor/sample.tsx', specifier: '@react-three/fiber' },
  { filePath: 'editor/sample.tsx', specifier: '@react-three/drei' },
  { filePath: 'app/sample.tsx', specifier: 'three' },
  { filePath: 'app/sample.tsx', specifier: 'three/addons/controls/OrbitControls.js' },
  { filePath: 'app/sample.tsx', specifier: '@react-three/fiber' },
  { filePath: 'app/sample.tsx', specifier: '@react-three/drei' },
  ...['bridge/sample.tsx', 'editor/sample.tsx', 'app/sample.tsx'].flatMap((filePath) =>
    ['../engine/testing', '../../engine/testing'].map((specifier) => ({ filePath, specifier })),
  ),
  { filePath: 'src/sample.tsx', specifier: '../engine/testing' },
  { filePath: 'src/nested/sample.tsx', specifier: '../../engine/testing' },
  { filePath: 'engine/sample.ts', specifier: './testing' },
  { filePath: 'engine/scene/sample.ts', specifier: '../testing' },
  { filePath: 'engine/scene/sample-support.ts', specifier: '../testing' },
  { filePath: 'engine/scene/sample.ts', specifier: '../testing/index' },
  { filePath: 'engine/scene/sample.ts', specifier: '../testing/index.js' },
  { filePath: 'engine/scene/deep/sample.ts', specifier: '../../testing/helpers' },
  { filePath: 'engine/scene/sample.ts', specifier: '../testing', statement: 'type-import' },
  { filePath: 'engine/scene/sample.ts', specifier: '../testing', statement: 'reexport' },
  { filePath: 'bridge/react/sample.tsx', specifier: '../../engine/testing/index' },
  { filePath: 'editor/sample.tsx', specifier: '../engine/testing/index' },
  { filePath: 'app/sample.tsx', specifier: '../engine/testing/index' },
  { filePath: 'src/sample.tsx', specifier: '../engine/testing/index' },
  { filePath: 'editor/shell/sample-test-support.tsx', specifier: '../../engine/testing' },
]

const acceptedImports: readonly ImportCase[] = [
  { filePath: 'core/sample.ts', specifier: './other' },
  { filePath: 'engine/sample.ts', specifier: 'three' },
  { filePath: 'engine/sample.ts', specifier: 'three/addons/controls/OrbitControls.js' },
  { filePath: 'bridge/sample.tsx', specifier: '@react-three/fiber' },
  { filePath: 'bridge/sample.tsx', specifier: '@react-three/drei' },
  { filePath: 'bridge/sample.tsx', specifier: 'three-stdlib' },
  { filePath: 'bridge/react/sample.test.ts', specifier: '../../engine/testing' },
  { filePath: 'engine/scene/sample.test.ts', specifier: '../testing' },
  { filePath: 'engine/scene/sample-test-support.ts', specifier: '../testing' },
  { filePath: 'engine/testing/sample.ts', specifier: './geometry-assertions' },
  { filePath: 'src/sample.test.tsx', specifier: '../engine/testing' },
  { filePath: 'engine/scene/sample-test-support.tsx', specifier: '../testing' },
  ...[
    'engine/sample.ts',
    'bridge/sample.ts',
    'editor/sample.ts',
    'app/sample.ts',
    'src/sample.ts',
  ].flatMap((filePath) =>
    ['@testing-library/react', '../testing-utils'].map((specifier) => ({ filePath, specifier })),
  ),
  { filePath: 'editor/shell/sample.ts', specifier: './testing/helpers' },
  { filePath: 'bridge/sample.ts', specifier: '../testing/helpers' },
  { filePath: 'app/sample.ts', specifier: './testing/helpers' },
  { filePath: 'src/sample.ts', specifier: '../testing/helpers' },
  { filePath: 'bridge/sample.tsx', specifier: 'react' },
  { filePath: 'bridge/sample.tsx', specifier: 'react/jsx-runtime' },
  { filePath: 'editor/sample.tsx', specifier: 'react' },
  { filePath: 'editor/sample.tsx', specifier: 'react-dom/client' },
  { filePath: 'app/sample.tsx', specifier: 'react' },
  { filePath: 'app/sample.tsx', specifier: 'react-dom/client' },
]

describe('layer purity: imports', () => {
  it.each(rejectedImports)(
    'rejects $filePath importing $specifier',
    { timeout: LINT_TIMEOUT_MS },
    async ({ filePath, specifier, statement }) => {
      const ids = await purityRuleIds(importSample(specifier, statement), filePath)
      expect(ids).toContain(IMPORT_RULE)
    },
  )

  it.each(acceptedImports)(
    'allows $filePath importing $specifier',
    { timeout: LINT_TIMEOUT_MS },
    async ({ filePath, specifier, statement }) => {
      const ids = await purityRuleIds(importSample(specifier, statement), filePath)
      expect(ids).toEqual([])
    },
  )
})

describe('layer purity: browser globals', () => {
  it.each(['window', 'document'])(
    'rejects a core module using the global %s',
    { timeout: LINT_TIMEOUT_MS },
    async (name) => {
      const ids = await purityRuleIds(globalSample(name), 'core/sample.ts')
      expect(ids).toContain(GLOBAL_RULE)
    },
  )

  it('allows a core test file using the global window', { timeout: LINT_TIMEOUT_MS }, async () => {
    const ids = await purityRuleIds(globalSample('window'), 'core/sample.test.ts')
    expect(ids).toEqual([])
  })

  it.each(['window', 'document'])(
    'rejects a session module using the global %s',
    { timeout: LINT_TIMEOUT_MS },
    async (name) => {
      const ids = await purityRuleIds(globalSample(name), 'session/sample.ts')
      expect(ids).toContain(GLOBAL_RULE)
    },
  )

  it('allows a session module using setTimeout', { timeout: LINT_TIMEOUT_MS }, async () => {
    const code = 'export const value = setTimeout(() => undefined, 0)\n'
    const ids = await purityRuleIds(code, 'session/sample.ts')
    expect(ids).toEqual([])
  })

  it(
    'allows a session module using crypto.randomUUID()',
    { timeout: LINT_TIMEOUT_MS },
    async () => {
      const ids = await purityRuleIds(
        'export const value = crypto.randomUUID()\n',
        'session/sample.ts',
      )
      expect(ids).toEqual([])
    },
  )

  it(
    'allows a session test file using the global window',
    { timeout: LINT_TIMEOUT_MS },
    async () => {
      const ids = await purityRuleIds(globalSample('window'), 'session/sample.test.ts')
      expect(ids).toEqual([])
    },
  )

  it(
    'names the session layer in the message for a session module using window',
    { timeout: LINT_TIMEOUT_MS },
    async () => {
      const messages = await globalRuleMessages(globalSample('window'), 'session/sample.ts')
      expect(messages.join('\n')).toContain('session/')
    },
  )

  it(
    'names the core layer in the message for a core module using window',
    { timeout: LINT_TIMEOUT_MS },
    async () => {
      const messages = await globalRuleMessages(globalSample('window'), 'core/sample.ts')
      expect(messages.join('\n')).toContain('core/')
    },
  )

  it('allows a core module using Math.max', { timeout: LINT_TIMEOUT_MS }, async () => {
    const ids = await purityRuleIds('export const value = Math.max(1, 2)\n', 'core/sample.ts')
    expect(ids).toEqual([])
  })

  it('allows a storage module using localStorage', { timeout: LINT_TIMEOUT_MS }, async () => {
    const ids = await purityRuleIds(globalSample('localStorage'), 'storage/sample.ts')
    expect(ids).toEqual([])
  })
})
