// @vitest-environment node
// ESLint resolves its configuration through Node's fs module, which needs the node environment, not the project-wide jsdom.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint, type Linter } from 'eslint'
import { describe, expect, it } from 'vitest'

const SAMPLE_PATHS = [
  'core/sample.ts',
  'storage/sample.ts',
  'session/sample.ts',
  'engine/sample.ts',
  'bridge/sample.tsx',
  'editor/sample.tsx',
  'app/sample.tsx',
  'src/sample.tsx',
  'core/sample.test.ts',
  'editor/sample.stories.tsx',
  'e2e/tests/sample.spec.ts',
]

const WARNING_LEVEL = 1
const ERROR_LEVEL = 2
const CONFIG_TIMEOUT_MS = 30_000

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const eslint = new ESLint({ cwd: repositoryRoot })

function severityOf(entry: Linter.RuleEntry | undefined): number | string | undefined {
  return Array.isArray(entry) ? entry[0] : entry
}

async function rulesAtWarningLevel(path: string): Promise<string[]> {
  const resolved = (await eslint.calculateConfigForFile(path)) as Linter.Config
  const rules = Object.entries(resolved.rules ?? {})
  return rules.filter(([, entry]) => severityOf(entry) === WARNING_LEVEL).map(([name]) => name)
}

describe('lint severity', () => {
  describe.each(SAMPLE_PATHS)('for %s', (path) => {
    it('has no rule at warning level', { timeout: CONFIG_TIMEOUT_MS }, async () => {
      expect(await rulesAtWarningLevel(path), `rules still at warning level for ${path}`).toEqual(
        [],
      )
    })

    it(
      'reports an unused disable directive as an error',
      { timeout: CONFIG_TIMEOUT_MS },
      async () => {
        const resolved = (await eslint.calculateConfigForFile(path)) as Linter.Config
        expect(resolved.linterOptions?.reportUnusedDisableDirectives).toBe(ERROR_LEVEL)
      },
    )
  })

  it('runs the lint script with no warning allowed', async () => {
    const manifest = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(manifest.scripts.lint).toBe('eslint . --max-warnings 0')
  })
})
