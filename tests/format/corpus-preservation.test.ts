import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { InMemoryDirectory } from '../../storage/fs/in-memory-directory'
import { FolderProjectStore } from '../../storage/folder/folder-project-store'

// Extension keys are reverse-DNS namespaces (spec section 6.3), not camelCase by design.
const COVERED_OUTDOOR_NAMESPACE = 'org.vernacular.covered-outdoor'

const fixturePath = resolve(
  'tests/fixtures/projects/corpus',
  '18-usda-plan-7156-two-bedroom-ranch-with-carport.vernacular.json',
)

interface ExtensionBearingDocument {
  extensions?: Record<string, { rooms?: unknown[] }>
}

function readFixtureBytes(): Uint8Array {
  try {
    return new Uint8Array(readFileSync(fixturePath))
  } catch (error) {
    // Only a genuinely absent file is the "add the fixture" signal; surface any other
    // OS error (permissions, descriptor limits) as-is rather than disguising it as missing.
    if ((error as { code?: string }).code !== 'ENOENT') {
      throw error
    }
    throw new Error(
      `Tier-2 corpus fixture is missing: ${fixturePath}. ` +
        'The covered-outdoor preservation round-trip needs this fixture on disk.',
    )
  }
}

function parseDocument(bytes: Uint8Array): ExtensionBearingDocument {
  return JSON.parse(new TextDecoder().decode(bytes)) as ExtensionBearingDocument
}

describe('Tier-2 corpus fixture preservation (ADR-0051 forward compatibility)', () => {
  it('preserves covered-outdoor extension data across a FolderProjectStore round-trip', async () => {
    const originalBytes = readFixtureBytes()
    const original = parseDocument(originalBytes)

    const originalCoveredOutdoor = original.extensions?.[COVERED_OUTDOOR_NAMESPACE]
    expect(
      originalCoveredOutdoor,
      `original fixture should declare the ${COVERED_OUTDOOR_NAMESPACE} extension namespace`,
    ).toBeDefined()
    expect(originalCoveredOutdoor?.rooms ?? []).not.toHaveLength(0)

    const directory = new InMemoryDirectory()
    await directory.writeFile('vernacular.json', originalBytes)
    const store = new FolderProjectStore(directory)

    const loaded = await store.loadProject()
    await store.saveProject(loaded)

    const savedBytes = await directory.readFile('vernacular.json')
    expect(savedBytes).toBeDefined()
    const saved = parseDocument(savedBytes!)

    expect(saved.extensions?.[COVERED_OUTDOOR_NAMESPACE]).toEqual(originalCoveredOutdoor)
  })
})
