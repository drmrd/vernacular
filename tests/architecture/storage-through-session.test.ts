// @vitest-environment node
// ESLint's lintText reads files through Node's fs module, which needs the node environment, not the project-wide jsdom.
import { fileURLToPath } from 'node:url'
import { ESLint, type Linter } from 'eslint'
import { describe, expect, it } from 'vitest'

interface StorageAllowance {
  file: string
  allowImportOf: 'storage'
  issue: number
}

interface ConfigModule {
  buildConfig: (exceptions?: StorageAllowance[]) => Linter.Config[]
}

// eslint.config.js is plain JavaScript with no declaration file, so load it by a
// path held in a variable. The module is typed here, at the one place it is read.
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const CONFIG_PATH = '../../eslint.config.js'
const config = (await import(/* @vite-ignore */ CONFIG_PATH)) as ConfigModule

const LINT_TIMEOUT_MS = 30_000
const LAYER_RULE = 'boundaries/dependencies'
const REMOVING_ISSUE = 717
const LISTED_BRIDGE_FILE = 'bridge/sample.ts'
const LISTED_EDITOR_FILE = 'editor/sample.tsx'

const committedConfig = new ESLint()
const withListedFiles = new ESLint({
  cwd: repositoryRoot,
  overrideConfigFile: true,
  overrideConfig: config.buildConfig([
    { file: LISTED_BRIDGE_FILE, allowImportOf: 'storage', issue: REMOVING_ISSUE },
    { file: LISTED_EDITOR_FILE, allowImportOf: 'storage', issue: REMOVING_ISSUE },
  ]),
})

type Statement = 'value import' | 'type import'

function importSample(specifier: string, statement: Statement): string {
  return statement === 'type import'
    ? `import type { Imported } from '${specifier}'\nexport type Value = Imported\n`
    : `import { Imported } from '${specifier}'\nexport const value = Imported\n`
}

interface SampleImport {
  filePath: string
  specifier: string
  statement: Statement
}

async function layerRuleReported(eslint: ESLint, sample: SampleImport): Promise<boolean> {
  const code = importSample(sample.specifier, sample.statement)
  const [result] = await eslint.lintText(code, { filePath: sample.filePath })
  return result?.messages.some((message) => message.ruleId === LAYER_RULE) ?? false
}

const unlistedImporters = ['bridge/sample.ts', 'editor/sample.tsx']
const statements: Statement[] = ['value import', 'type import']
const unlistedCases = unlistedImporters.flatMap((filePath) =>
  statements.map((statement) => ({ filePath, statement })),
)

function valueImport(filePath: string, specifier: string): SampleImport {
  return { filePath, specifier, statement: 'value import' }
}

describe('bridge and editor reach storage only through session', () => {
  describe('under the committed lint config', () => {
    it.each(unlistedCases)(
      'rejects $filePath for a $statement of storage',
      { timeout: LINT_TIMEOUT_MS },
      async ({ filePath, statement }) => {
        const sample = { filePath, specifier: '../storage', statement }
        expect(await layerRuleReported(committedConfig, sample)).toBe(true)
      },
    )
  })

  describe('under a config that lists bridge/sample.ts and editor/sample.tsx for storage', () => {
    it.each(statements)(
      'accepts the listed bridge file for a %s of storage',
      { timeout: LINT_TIMEOUT_MS },
      async (statement) => {
        const sample = { filePath: LISTED_BRIDGE_FILE, specifier: '../storage', statement }
        expect(await layerRuleReported(withListedFiles, sample)).toBe(false)
      },
    )

    it(
      'still accepts the listed bridge file for engine',
      { timeout: LINT_TIMEOUT_MS },
      async () => {
        const sample = valueImport(LISTED_BRIDGE_FILE, '../engine')
        expect(await layerRuleReported(withListedFiles, sample)).toBe(false)
      },
    )

    it('still rejects the listed bridge file for app', { timeout: LINT_TIMEOUT_MS }, async () => {
      const sample = valueImport(LISTED_BRIDGE_FILE, '../app')
      expect(await layerRuleReported(withListedFiles, sample)).toBe(true)
    })

    it(
      'still rejects a bridge file that is not listed for storage',
      { timeout: LINT_TIMEOUT_MS },
      async () => {
        const sample = valueImport('bridge/other.ts', '../storage')
        expect(await layerRuleReported(withListedFiles, sample)).toBe(true)
      },
    )

    it(
      'accepts the listed editor file for a value import of storage',
      { timeout: LINT_TIMEOUT_MS },
      async () => {
        const sample = valueImport(LISTED_EDITOR_FILE, '../storage')
        expect(await layerRuleReported(withListedFiles, sample)).toBe(false)
      },
    )

    it('still rejects the listed editor file for app', { timeout: LINT_TIMEOUT_MS }, async () => {
      const sample = valueImport(LISTED_EDITOR_FILE, '../app')
      expect(await layerRuleReported(withListedFiles, sample)).toBe(true)
    })
  })
})
