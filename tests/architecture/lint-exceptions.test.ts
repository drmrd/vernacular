// @vitest-environment node
// ESLint's lintText reads files through Node's fs module, which needs the node environment, not the project-wide jsdom.
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { ESLint, type Linter } from 'eslint'
import { describe, expect, it } from 'vitest'

interface LintException {
  file: string
  rule: string
  issue: number
  max?: number
}

interface ConfigModule {
  lintExceptions: LintException[]
  buildConfig: (exceptions?: LintException[]) => Linter.Config[]
}

// eslint.config.js is plain JavaScript with no declaration file, so load it by a
// path held in a variable. The module is typed here, at the one place it is read.
const CONFIG_PATH = '../../eslint.config.js'
const config = (await import(/* @vite-ignore */ CONFIG_PATH)) as ConfigModule

const SIZE_RULES = ['max-lines', 'max-lines-per-function', 'max-params', 'max-depth', 'complexity']

// Linting every listed file is CPU-bound, so allow far more than Vitest's 5s default.
const LINT_ALL_FILES_TIMEOUT_MS = 120_000
const LINT_SAMPLE_TIMEOUT_MS = 30_000
const RAISED_PARAM_LIMIT = 4

function isSizeRule(rule: string): boolean {
  return SIZE_RULES.includes(rule)
}

function describeEntry(entry: LintException): string {
  return `${entry.file} (${entry.rule}, issue #${entry.issue})`
}

function problemsWithEntry(entry: LintException): string[] {
  const problems: string[] = []
  if (!Number.isInteger(entry.issue) || entry.issue <= 0) {
    problems.push(`${describeEntry(entry)}: issue must be a positive number`)
  }
  if (!existsSync(entry.file)) {
    problems.push(`${describeEntry(entry)}: file does not exist`)
  }
  if (isSizeRule(entry.rule) !== (entry.max !== undefined)) {
    problems.push(`${describeEntry(entry)}: max is required for a size rule and only for one`)
  }
  return problems
}

/** Lints each distinct listed file once and returns the rule ids reported for it. */
async function reportedRulesByFile(
  exceptions: LintException[],
  configToLint: Linter.Config[],
): Promise<Map<string, Set<string | null>>> {
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: configToLint })
  const files = [...new Set(exceptions.map((entry) => entry.file))]
  const entries = await Promise.all(
    files.map(async (file) => {
      const [result] = await eslint.lintText(await readFile(file, 'utf8'), { filePath: file })
      const rules = new Set(result?.messages.map((message) => message.ruleId))
      return [file, rules] as const
    }),
  )
  return new Map(entries)
}

async function ruleIdsForSample(code: string, exceptions: LintException[]): Promise<string[]> {
  const eslint = new ESLint({
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
      const { lintExceptions, buildConfig } = config
      const reported = await reportedRulesByFile(lintExceptions, buildConfig())
      const unmet = lintExceptions.filter((entry) => reported.get(entry.file)?.has(entry.rule))
      expect(unmet.map(describeEntry), 'entries that do not cover their file').toEqual([])
    },
  )

  it(
    'reports each listed rule in its listed file without the exceptions, so no entry is stale',
    { timeout: LINT_ALL_FILES_TIMEOUT_MS },
    async () => {
      const { lintExceptions, buildConfig } = config
      const reported = await reportedRulesByFile(lintExceptions, buildConfig([]))
      const stale = lintExceptions.filter((entry) => !reported.get(entry.file)?.has(entry.rule))
      expect(stale.map(describeEntry), 'stale entries: their file now meets the limit').toEqual([])
    },
  )

  describe('an entry that caps max-params at four for core/sample.ts', () => {
    const entry: LintException = {
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
