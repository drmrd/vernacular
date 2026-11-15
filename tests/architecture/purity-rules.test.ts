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
}

async function purityRuleIds(code: string, filePath: string): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(code, { filePath })
  const purityRules = [IMPORT_RULE, GLOBAL_RULE]
  return (result?.messages ?? [])
    .map((message) => message.ruleId)
    .filter((ruleId) => ruleId !== null && purityRules.includes(ruleId))
}

function importSample(specifier: string): string {
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
]

const acceptedImports: readonly ImportCase[] = [
  { filePath: 'core/sample.ts', specifier: './other' },
  { filePath: 'engine/sample.ts', specifier: 'three' },
  { filePath: 'engine/sample.ts', specifier: 'three/addons/controls/OrbitControls.js' },
  { filePath: 'bridge/sample.tsx', specifier: '@react-three/fiber' },
  { filePath: 'bridge/sample.tsx', specifier: '@react-three/drei' },
  { filePath: 'bridge/sample.tsx', specifier: 'three-stdlib' },
  { filePath: 'bridge/react/sample.test.ts', specifier: '../../engine/testing' },
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
    async ({ filePath, specifier }) => {
      const ids = await purityRuleIds(importSample(specifier), filePath)
      expect(ids).toContain(IMPORT_RULE)
    },
  )

  it.each(acceptedImports)(
    'allows $filePath importing $specifier',
    { timeout: LINT_TIMEOUT_MS },
    async ({ filePath, specifier }) => {
      const ids = await purityRuleIds(importSample(specifier), filePath)
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

  it('allows a core module using Math.max', { timeout: LINT_TIMEOUT_MS }, async () => {
    const ids = await purityRuleIds('export const value = Math.max(1, 2)\n', 'core/sample.ts')
    expect(ids).toEqual([])
  })

  it('allows a storage module using localStorage', { timeout: LINT_TIMEOUT_MS }, async () => {
    const ids = await purityRuleIds(globalSample('localStorage'), 'storage/sample.ts')
    expect(ids).toEqual([])
  })
})
