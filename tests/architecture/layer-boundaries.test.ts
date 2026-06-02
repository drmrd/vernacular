// @vitest-environment node
// ESLint's lintText reads files through Node's fs module, which needs the node environment, not the project-wide jsdom.
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

async function ruleIdsFor(code: string, filePath: string): Promise<(string | null)[]> {
  const eslint = new ESLint()
  const [result] = await eslint.lintText(code, { filePath })
  return result?.messages.map((message) => message.ruleId) ?? []
}

describe('layer boundary enforcement', () => {
  it('rejects a core module importing storage', async () => {
    const ids = await ruleIdsFor(
      "import type { ProjectStore } from '../storage'\nexport type Forbidden = ProjectStore\n",
      'core/boundary-sample.ts',
    )
    expect(ids).toContain('boundaries/dependencies')
  })

  it('allows a storage module importing core', async () => {
    const ids = await ruleIdsFor(
      "import type { Project } from '../core'\nexport type Allowed = Project\n",
      'storage/boundary-sample.ts',
    )
    expect(ids).not.toContain('boundaries/dependencies')
  })
})
