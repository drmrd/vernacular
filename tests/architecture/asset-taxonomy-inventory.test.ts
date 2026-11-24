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
  if (start === -1) {
    throw new Error(`${SPECIFICATION_PATH} has no "## Inventory" section`)
  }
  // Skip the first character so the search below cannot match the "## " that opens this section.
  const rest = specification.slice(start + 1)
  const next = rest.search(/^## /m)
  return next === -1 ? rest : rest.slice(0, next)
}

function required(value: string | undefined, what: string): string {
  if (value === undefined) {
    throw new Error(`Malformed inventory: missing ${what}`)
  }
  return value
}

function parseInventory(section: string): InventoryDomain[] {
  const headings = [...section.matchAll(/^#### `([A-Z]{3})`: (.+) \((\d+)\)$/gm)]
  return headings.map((heading, index) => {
    const label = heading[0]
    const bodyStart = Number(required(heading.index?.toString(), `index of heading ${label}`))
    const bodyEnd = headings[index + 1]?.index ?? section.length
    const paragraph = section
      .slice(bodyStart + label.length, bodyEnd)
      .split(/\n\s*\n/)
      .find((block) => block.trim() !== '')
    if (paragraph === undefined) {
      throw new Error(`Malformed inventory: no id paragraph under heading ${label}`)
    }
    const ids = [...paragraph.matchAll(/`([^`]+)`/g)].map((match) =>
      required(match[1], `id in ${label}`),
    )
    return {
      code: required(heading[1], `code of heading ${label}`),
      name: required(heading[2], `name of heading ${label}`),
      count: Number(required(heading[3], `count of heading ${label}`)),
      ids,
    }
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
