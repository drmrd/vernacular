// @vitest-environment node
// ESLint's lintText reads files through Node's fs module, which needs the node environment, not the project-wide jsdom.
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'
import * as sessionEntry from '../../session'
import * as sessionTestingEntry from '../../session/testing'

// One shared instance: building the flat config is the expensive part. Linting is
// CPU-bound, so allow extra time over Vitest's 5s per-test default.
const eslint = new ESLint()
const LINT_TIMEOUT_MS = 30_000

const IMPORT_RULE = 'no-restricted-imports'

interface ImportCase {
  readonly filePath: string
  readonly specifier: string
}

async function importRuleReported(filePath: string, specifier: string): Promise<boolean> {
  const code = `import * as imported from '${specifier}'\nexport const value = imported\n`
  const [result] = await eslint.lintText(code, { filePath })
  return result?.messages.some((message) => message.ruleId === IMPORT_RULE) ?? false
}

const rejectedImports: readonly ImportCase[] = [
  { filePath: 'editor/sample.tsx', specifier: '../session/testing' },
  { filePath: 'bridge/sample.tsx', specifier: '../session/testing' },
  { filePath: 'app/sample.tsx', specifier: '../session/testing' },
  { filePath: 'src/sample.tsx', specifier: '../session/testing' },
  { filePath: 'editor/shell/sample.tsx', specifier: '../../session/testing/index' },
  { filePath: 'session/editor-session/sample.ts', specifier: '../testing' },
]

const acceptedImports: readonly ImportCase[] = [
  { filePath: 'editor/sample.test.tsx', specifier: '../session/testing' },
  { filePath: 'editor/sample.stories.tsx', specifier: '../session/testing' },
  { filePath: 'bridge/react/sample.test.tsx', specifier: '../../session/testing' },
  { filePath: 'session/autosave/sample.test.ts', specifier: '../testing' },
  { filePath: 'session/testing/sample.ts', specifier: './in-memory' },
  { filePath: 'editor/sample.tsx', specifier: '../session' },
  { filePath: 'editor/shell/sample-test-support.tsx', specifier: '../../session/testing' },
]

describe('the session testing entry', () => {
  it.each(rejectedImports)(
    'rejects $filePath importing $specifier',
    { timeout: LINT_TIMEOUT_MS },
    async ({ filePath, specifier }) => {
      expect(await importRuleReported(filePath, specifier)).toBe(true)
    },
  )

  it.each(acceptedImports)(
    'allows $filePath importing $specifier',
    { timeout: LINT_TIMEOUT_MS },
    async ({ filePath, specifier }) => {
      expect(await importRuleReported(filePath, specifier)).toBe(false)
    },
  )

  it(
    'still rejects a story file importing the engine testing entry',
    { timeout: LINT_TIMEOUT_MS },
    async () => {
      expect(await importRuleReported('editor/sample.stories.tsx', '../engine/testing')).toBe(true)
    },
  )
})

describe('the names that the session entries export', () => {
  it('session/index.ts exports no createEditorSession', () => {
    expect(Object.keys(sessionEntry)).not.toContain('createEditorSession')
  })

  it('session/testing exports createEditorSession and createTestPorts', () => {
    expect(Object.keys(sessionTestingEntry)).toEqual(
      expect.arrayContaining(['createEditorSession', 'createTestPorts']),
    )
  })
})
