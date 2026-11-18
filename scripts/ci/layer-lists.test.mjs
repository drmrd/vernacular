import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'
import { reminderMessages } from '../hooks/commit-reminders.mjs'
import { LAYERS } from './layers.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const CONFIG_TIMEOUT_MS = 30_000

function readRepositoryFile(name) {
  return readFile(resolve(repositoryRoot, name), 'utf8')
}

describe('the layer lists beside the CI layer order', () => {
  it('lets the TypeScript project include every layer', async () => {
    const { include } = JSON.parse(await readRepositoryFile('tsconfig.json'))
    for (const layer of LAYERS) {
      expect(include, `tsconfig.json include is missing the ${layer} layer`).toContain(layer)
    }
  })

  it('reports coverage for every layer', async () => {
    const config = await readRepositoryFile('vite.config.ts')
    for (const layer of LAYERS) {
      expect(config, `vite.config.ts coverage include is missing the ${layer} layer`).toContain(
        `'${layer}/**/*.{ts,tsx}'`,
      )
    }
  })

  it('lets the import graph helper read every layer directory', async () => {
    const helper = await readRepositoryFile('tests/architecture/import-graph.ts')
    const [, listed = ''] = /LAYER_DIRECTORIES\s*=\s*\[([^\]]*)\]/.exec(helper) ?? []
    for (const layer of LAYERS) {
      expect(
        listed,
        `LAYER_DIRECTORIES in import-graph.ts is missing the ${layer} layer`,
      ).toContain(`'${layer}'`)
    }
  })

  it(
    'lets the lint config know every layer as a boundary element',
    { timeout: CONFIG_TIMEOUT_MS },
    async () => {
      const eslint = new ESLint({ cwd: repositoryRoot })
      const resolved = await eslint.calculateConfigForFile('core/index.ts')
      const types = resolved.settings['boundaries/elements'].map((element) => element.type)
      for (const layer of LAYERS) {
        expect(types, `the lint boundary elements are missing the ${layer} layer`).toContain(layer)
      }
    },
  )

  it(
    'lets the lint config include a pattern for every layer',
    { timeout: CONFIG_TIMEOUT_MS },
    async () => {
      const eslint = new ESLint({ cwd: repositoryRoot })
      const resolved = await eslint.calculateConfigForFile('core/index.ts')
      const include = resolved.settings['boundaries/include']
      for (const layer of LAYERS) {
        expect(include, `the lint include list is missing the ${layer} layer`).toContain(
          `${layer}/**`,
        )
      }
    },
  )

  it('reminds about a staged change in every layer', () => {
    for (const layer of LAYERS) {
      expect(
        reminderMessages([`${layer}/sample.ts`]),
        `the commit reminders ignore the ${layer} layer`,
      ).not.toEqual([])
    }
  })
})
