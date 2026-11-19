// @vitest-environment node
// ESLint's lintText reads files through Node's fs module, which needs the node environment, not the project-wide jsdom.
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// Constructing the ESLint flat config is the expensive part, so build one shared
// instance for the whole file instead of one per test. Linting is type-aware and
// CPU-bound, so allow extra time over Vitest's 5s per-test default when the unit
// suite saturates the worker pool, even though each lint finishes quickly alone.
const eslint = new ESLint()
const LINT_TIMEOUT_MS = 30_000

async function ruleIdsFor(code: string, filePath: string): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(code, { filePath })
  return result?.messages.map((message) => message.ruleId) ?? []
}

interface ImportCase {
  title: string
  importerPath: string
  specifier: string
  name: string
}

const rejectedImports: readonly ImportCase[] = [
  {
    title: 'rejects a session module importing bridge',
    importerPath: 'session/boundary-sample.ts',
    specifier: '../bridge',
    name: 'EditorSession',
  },
  {
    title: 'rejects a session module importing editor',
    importerPath: 'session/boundary-sample.ts',
    specifier: '../editor',
    name: 'EditorShellProps',
  },
  {
    title: 'rejects a session module importing engine',
    importerPath: 'session/boundary-sample.ts',
    specifier: '../engine',
    name: 'SceneRoot',
  },
  {
    title: 'rejects an editor module importing engine',
    importerPath: 'editor/boundary-sample.ts',
    specifier: '../engine',
    name: 'SceneRoot',
  },
  {
    title: 'rejects a storage module importing session',
    importerPath: 'storage/boundary-sample.ts',
    specifier: '../session',
    name: 'EditorSession',
  },
  {
    title: 'rejects an engine module importing session',
    importerPath: 'engine/boundary-sample.ts',
    specifier: '../session',
    name: 'EditorSession',
  },
  {
    title: 'rejects an engine module importing storage',
    importerPath: 'engine/boundary-sample.ts',
    specifier: '../storage',
    name: 'ProjectStore',
  },
]

const allowedImports: readonly ImportCase[] = [
  {
    title: 'allows a session module importing core',
    importerPath: 'session/boundary-sample.ts',
    specifier: '../core',
    name: 'Project',
  },
  {
    title: 'allows a session module importing storage',
    importerPath: 'session/boundary-sample.ts',
    specifier: '../storage',
    name: 'ProjectStore',
  },
  {
    title: 'allows a bridge module importing session',
    importerPath: 'bridge/boundary-sample.ts',
    specifier: '../session',
    name: 'EditorSession',
  },
  {
    title: 'allows a bridge module importing engine',
    importerPath: 'bridge/boundary-sample.ts',
    specifier: '../engine',
    name: 'SceneRoot',
  },
  {
    title: 'allows an editor module importing session',
    importerPath: 'editor/boundary-sample.ts',
    specifier: '../session',
    name: 'EditorSession',
  },
  {
    title: 'allows an editor module importing bridge',
    importerPath: 'editor/boundary-sample.ts',
    specifier: '../bridge',
    name: 'EditorSession',
  },
]

function typeImportOf(specifier: string, name: string): string {
  return `import type { ${name} } from '${specifier}'\nexport type Sample = ${name}\n`
}

describe('layer boundary enforcement', () => {
  it('rejects a core module importing storage', { timeout: LINT_TIMEOUT_MS }, async () => {
    const ids = await ruleIdsFor(
      "import type { ProjectStore } from '../storage'\nexport type Forbidden = ProjectStore\n",
      'core/boundary-sample.ts',
    )
    expect(ids).toContain('boundaries/dependencies')
  })

  it('allows a storage module importing core', { timeout: LINT_TIMEOUT_MS }, async () => {
    const ids = await ruleIdsFor(
      "import type { Project } from '../core'\nexport type Allowed = Project\n",
      'storage/boundary-sample.ts',
    )
    expect(ids).not.toContain('boundaries/dependencies')
  })

  it.each(rejectedImports)(
    '$title',
    { timeout: LINT_TIMEOUT_MS },
    async ({ importerPath, specifier, name }) => {
      const ids = await ruleIdsFor(typeImportOf(specifier, name), importerPath)
      expect(ids).toContain('boundaries/dependencies')
    },
  )

  it.each(allowedImports)(
    '$title',
    { timeout: LINT_TIMEOUT_MS },
    async ({ importerPath, specifier, name }) => {
      const ids = await ruleIdsFor(typeImportOf(specifier, name), importerPath)
      expect(ids).not.toContain('boundaries/dependencies')
    },
  )
})
