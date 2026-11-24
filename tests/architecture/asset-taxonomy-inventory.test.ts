// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { builtinAssetCategories } from '../../core/registries/asset-categories.ts'
import { builtinAssetDomains } from '../../core/registries/asset-domains.ts'
import { getEntry } from '../../core/registries/registry.ts'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const SPECIFICATION_PATH = 'docs/specs/2026-11-23-asset-taxonomy.md'
const DOMAIN_COUNT = 30

interface InventoryDomain {
  readonly code: string
  readonly name: string
  readonly count: number
  readonly ids: readonly string[]
}

function inventorySection(specification: string): string {
  const start = specification.search(/^## Inventory$/m)
  const rest = specification.slice(start + 1)
  const next = rest.search(/^## /m)
  return next === -1 ? rest : rest.slice(0, next)
}

function parseInventory(section: string): InventoryDomain[] {
  const headings = [...section.matchAll(/^#### `([A-Z]{3})`: (.+) \((\d+)\)$/gm)]
  return headings.map((heading, index) => {
    const bodyStart = (heading.index ?? 0) + heading[0].length
    const bodyEnd = headings[index + 1]?.index ?? section.length
    const paragraph =
      section
        .slice(bodyStart, bodyEnd)
        .split(/\n\s*\n/)
        .find((block) => block.trim() !== '') ?? ''
    const ids = [...paragraph.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? '')
    return { code: heading[1] ?? '', name: heading[2] ?? '', count: Number(heading[3]), ids }
  })
}

describe('the asset taxonomy inventory', () => {
  it('the category registry and the inventory of the specification list the same ids in the same order', async () => {
    const specification = await readFile(join(repositoryRoot, SPECIFICATION_PATH), 'utf8')
    const domains = parseInventory(inventorySection(specification))

    expect(domains).toHaveLength(DOMAIN_COUNT)
    expect(domains.flatMap((domain) => domain.ids.map((id) => `${domain.code}.${id}`))).toEqual(
      Object.keys(builtinAssetCategories.entries),
    )
    for (const domain of domains) {
      expect(domain.ids, domain.code).toHaveLength(domain.count)
      expect(getEntry(builtinAssetDomains, domain.code)?.name, domain.code).toBe(domain.name)
    }
  })
})
