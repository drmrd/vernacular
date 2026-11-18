// @vitest-environment node
// ESLint's lintText reads files through Node's fs module, which needs the node environment, not the project-wide jsdom.
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint, type Linter } from 'eslint'
import { describe, expect, it } from 'vitest'
import { filesImportingLayer, readLayerSources } from './import-graph'

interface RuleException {
  file: string
  rule: string
  issue: number
  max?: number
  allowImportOf?: undefined
}

interface ImportAllowanceException {
  file: string
  allowImportOf: string
  issue: number
  rule?: undefined
  max?: undefined
}

type LintException = RuleException | ImportAllowanceException

interface ConfigModule {
  lintExceptions: LintException[]
  buildConfig: (exceptions?: LintException[]) => Linter.Config[]
}

// eslint.config.js is plain JavaScript with no declaration file, so load it by a
// path held in a variable. The module is typed here, at the one place it is read.
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const CONFIG_PATH = '../../eslint.config.js'
const config = (await import(/* @vite-ignore */ CONFIG_PATH)) as ConfigModule

const SIZE_RULES = ['max-lines', 'max-lines-per-function', 'max-params', 'max-depth', 'complexity']

// Linting every listed file is CPU-bound, so allow far more than Vitest's 5s default.
const LINT_ALL_FILES_TIMEOUT_MS = 120_000
const LINT_SAMPLE_TIMEOUT_MS = 30_000
const RAISED_PARAM_LIMIT = 4
const ONE_BELOW_CAP = 1
const STORAGE_LAYER = 'storage'
const LAYERS_THROUGH_SESSION = ['bridge', 'editor']

function isImportAllowance(entry: LintException): entry is ImportAllowanceException {
  return entry.allowImportOf !== undefined
}

function isRuleException(entry: LintException): entry is RuleException {
  return !isImportAllowance(entry)
}

function isSizeRule(rule: string): boolean {
  return SIZE_RULES.includes(rule)
}

function whatIsListed(entry: LintException): string {
  return isImportAllowance(entry) ? `allowImportOf ${entry.allowImportOf}` : entry.rule
}

function entryKey(entry: LintException): string {
  return `${entry.file} (${whatIsListed(entry)})`
}

function describeEntry(entry: LintException): string {
  return `${entry.file} (${whatIsListed(entry)}, issue #${entry.issue})`
}

function problemsWithAllowance(entry: ImportAllowanceException): string[] {
  const problems: string[] = []
  if (entry.allowImportOf !== STORAGE_LAYER) {
    problems.push(`${describeEntry(entry)}: allowImportOf must be '${STORAGE_LAYER}'`)
  }
  if (entry.rule !== undefined || entry.max !== undefined) {
    problems.push(`${describeEntry(entry)}: an allowImportOf entry has no rule and no max`)
  }
  return problems
}

function problemsWithEntry(entry: LintException): string[] {
  const problems: string[] = []
  if (!Number.isInteger(entry.issue) || entry.issue <= 0) {
    problems.push(`${describeEntry(entry)}: issue must be a positive number`)
  }
  if (!existsSync(join(repositoryRoot, entry.file))) {
    problems.push(`${describeEntry(entry)}: file does not exist`)
  }
  if (isImportAllowance(entry)) return [...problems, ...problemsWithAllowance(entry)]
  if (isSizeRule(entry.rule) !== (entry.max !== undefined)) {
    problems.push(`${describeEntry(entry)}: max is required for a size rule and only for one`)
  }
  return problems
}

/** Lints each distinct listed file once and returns the rule ids reported for it. */
async function reportedRulesByFile(
  exceptions: RuleException[],
  configToLint: Linter.Config[],
): Promise<Map<string, Set<string | null>>> {
  const eslint = new ESLint({
    cwd: repositoryRoot,
    overrideConfigFile: true,
    overrideConfig: configToLint,
  })
  const files = [...new Set(exceptions.map((entry) => entry.file))]
  const entries = await Promise.all(
    files.map(async (file) => {
      const [result] = await eslint.lintText(await readFile(join(repositoryRoot, file), 'utf8'), {
        filePath: file,
      })
      const rules = new Set(result?.messages.map((message) => message.ruleId))
      return [file, rules] as const
    }),
  )
  return new Map(entries)
}

function duplicatedPairs(entries: LintException[]): string[] {
  const seen = new Set<string>()
  const duplicated = new Set<string>()
  for (const entry of entries) {
    const pair = entryKey(entry)
    if (seen.has(pair)) duplicated.add(pair)
    seen.add(pair)
  }
  return [...duplicated]
}

/** Whether the entry's file still reports the entry's rule once the entry's cap is one lower. */
async function capIsTight(entry: RuleException): Promise<boolean> {
  const lowered = config.lintExceptions.map((candidate) =>
    candidate === entry ? { ...entry, max: (entry.max ?? 0) - ONE_BELOW_CAP } : candidate,
  )
  const reported = await reportedRulesByFile([entry], config.buildConfig(lowered))
  return reported.get(entry.file)?.has(entry.rule) ?? false
}

async function ruleIdsForSample(code: string, exceptions: LintException[]): Promise<string[]> {
  const eslint = new ESLint({
    cwd: repositoryRoot,
    overrideConfigFile: true,
    overrideConfig: config.buildConfig(exceptions),
  })
  const [result] = await eslint.lintText(code, { filePath: 'core/sample.ts' })
  return result?.messages.flatMap((message) => (message.ruleId ? [message.ruleId] : [])) ?? []
}

describe('lint exception list', () => {
  it('gives every entry a positive issue, an existing file, and a limit exactly for a size rule', () => {
    const problems = config.lintExceptions.flatMap(problemsWithEntry)
    expect(problems).toEqual([])
  })

  it(
    'reports nothing for a listed rule in its listed file under the recorded exceptions',
    { timeout: LINT_ALL_FILES_TIMEOUT_MS },
    async () => {
      const { buildConfig } = config
      const lintExceptions = config.lintExceptions.filter(isRuleException)
      const reported = await reportedRulesByFile(lintExceptions, buildConfig())
      const unmet = lintExceptions.filter((entry) => reported.get(entry.file)?.has(entry.rule))
      expect(unmet.map(describeEntry), 'entries that do not cover their file').toEqual([])
    },
  )

  it(
    'reports each listed rule in its listed file without the exceptions, so no entry is stale',
    { timeout: LINT_ALL_FILES_TIMEOUT_MS },
    async () => {
      const { buildConfig } = config
      const lintExceptions = config.lintExceptions.filter(isRuleException)
      const reported = await reportedRulesByFile(lintExceptions, buildConfig([]))
      const stale = lintExceptions.filter((entry) => !reported.get(entry.file)?.has(entry.rule))
      expect(stale.map(describeEntry), 'stale entries: their file now meets the limit').toEqual([])
    },
  )

  it('lists no file and rule pair twice', () => {
    expect(duplicatedPairs(config.lintExceptions), 'pairs listed more than once').toEqual([])
  })

  it('lists exactly the bridge and editor files that import storage, no more and no fewer', () => {
    const importers = filesImportingLayer(
      readLayerSources(repositoryRoot),
      LAYERS_THROUGH_SESSION,
      STORAGE_LAYER,
    )
    const listed = config.lintExceptions
      .filter(isImportAllowance)
      .filter((entry) => entry.allowImportOf === STORAGE_LAYER)
      .map((entry) => entry.file)
      .sort()
    expect(listed, 'allowImportOf storage entries against the files that import storage').toEqual(
      importers,
    )
  })

  it(
    'reports the listed rule in its listed file when the cap is one lower, so no cap is loose',
    { timeout: LINT_ALL_FILES_TIMEOUT_MS },
    async () => {
      const capped = config.lintExceptions
        .filter(isRuleException)
        .filter((entry) => entry.max !== undefined)
      const loose: string[] = []
      for (const entry of capped) {
        if (!(await capIsTight(entry))) loose.push(`${describeEntry(entry)}, cap ${entry.max}`)
      }
      expect(loose, 'loose caps: their file passes with the cap one lower').toEqual([])
    },
  )

  describe('an entry that caps max-params at four for core/sample.ts', () => {
    const entry: RuleException = {
      file: 'core/sample.ts',
      rule: 'max-params',
      issue: 1,
      max: RAISED_PARAM_LIMIT,
    }

    it(
      'rejects a function with five parameters there',
      { timeout: LINT_SAMPLE_TIMEOUT_MS },
      async () => {
        const code =
          'export function sum(a: number, b: number, c: number, d: number, e: number): number {\n  return a + b + c + d + e\n}\n'
        expect(await ruleIdsForSample(code, [entry])).toContain('max-params')
      },
    )

    it(
      'accepts a function with four parameters there',
      { timeout: LINT_SAMPLE_TIMEOUT_MS },
      async () => {
        const code =
          'export function sum(a: number, b: number, c: number, d: number): number {\n  return a + b + c + d\n}\n'
        expect(await ruleIdsForSample(code, [entry])).not.toContain('max-params')
      },
    )
  })
})
