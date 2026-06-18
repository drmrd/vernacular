import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Floor, RoomOverride } from '../../core'
import { deriveRooms, roomKey } from '../../core'

const projectsDir = resolve('tests/fixtures/projects')
const corpusDir = resolve(projectsDir, 'corpus')

interface FixtureDocument {
  floors?: Floor[]
  roomOverrides?: Record<string, RoomOverride>
}

interface DiscoveredFixture {
  /** Path relative to the projects fixture root, used as the it.each label. */
  label: string
  /** Absolute path to the fixture on disk. */
  path: string
}

function vernacularFixturesIn(directory: string, prefix: string): DiscoveredFixture[] {
  let entries: string[]
  try {
    entries = readdirSync(directory)
  } catch {
    return []
  }
  return entries
    .filter((name) => name.endsWith('.vernacular.json'))
    .sort()
    .map((name) => ({ label: prefix + name, path: resolve(directory, name) }))
}

function discoverProjectFixtures(): DiscoveredFixture[] {
  return [...vernacularFixturesIn(projectsDir, ''), ...vernacularFixturesIn(corpusDir, 'corpus/')]
}

function loadFixture(fixturePath: string): FixtureDocument {
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as FixtureDocument
}

const fixtures = discoverProjectFixtures()
const overrideFixtures = fixtures.filter((fixture) => {
  const overrides = loadFixture(fixture.path).roomOverrides
  return overrides !== undefined && Object.keys(overrides).length > 0
})

describe('authored room-override keys bind to derived rooms', () => {
  it('discovers at least one fixture that declares room overrides', () => {
    expect(overrideFixtures.length).toBeGreaterThan(0)
  })

  it.each(overrideFixtures)(
    'every roomOverrides key in $label corresponds to a derived room',
    ({ label, path }) => {
      const document = loadFixture(path)
      const floors = document.floors ?? []
      const derivedKeys = new Set(floors.flatMap((floor) => deriveRooms(floor.walls).map(roomKey)))

      for (const overrideKey of Object.keys(document.roomOverrides ?? {})) {
        expect(
          derivedKeys.has(overrideKey),
          `fixture ${label} declares roomOverrides key "${overrideKey}" that matches no room derived from its walls`,
        ).toBe(true)
      }
    },
  )
})
