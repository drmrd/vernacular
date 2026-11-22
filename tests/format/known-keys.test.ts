import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KNOWN_KEYS, typesWithExtensions } from '../../core'
import { buildKnownKeys } from '../../scripts/schema/build-known-keys.mjs'
import { buildProjectSchema } from '../../scripts/schema/build-schema.mjs'

const JSON_INDENT = 2

// Regenerating the schema from the TypeScript types is CPU-bound and can exceed
// Vitest's 5s per-test default when the unit suite saturates the worker pool.
const GENERATION_TIMEOUT_MS = 30_000

const KNOWN_KEYS_FILE = 'core/model/known-keys.json'

const TYPES_WITH_EXTENSIONS = [
  'Dimension',
  'EnvironmentScene',
  'Floor',
  'Opening',
  'OpeningLight',
  'Project',
  'ProjectMeta',
  'ProjectPalette',
  'RoomOverride',
  'Stair',
  'Underlay',
  'Wall',
  'WeatherConditions',
]

/**
 * Lay out a scratch copy of the repository in which every entry is a symlink
 * to the real one, except that `core/model/known-keys.json` holds stale content.
 * The schema script reads and writes paths relative to its working directory.
 */
function makeRepositoryWithStaleTable(): string {
  const root = mkdtempSync(join(tmpdir(), 'known-keys-'))
  const real = resolve('.')
  for (const entry of readdirSync(real)) {
    if (entry !== 'core') symlinkSync(join(real, entry), join(root, entry))
  }
  mkdirSync(join(root, 'core', 'model'), { recursive: true })
  for (const entry of readdirSync(join(real, 'core'))) {
    if (entry !== 'model') symlinkSync(join(real, 'core', entry), join(root, 'core', entry))
  }
  for (const entry of readdirSync(join(real, 'core', 'model'))) {
    if (entry === 'known-keys.json') continue
    symlinkSync(join(real, 'core', 'model', entry), join(root, 'core', 'model', entry))
  }
  writeFileSync(join(root, KNOWN_KEYS_FILE), '{}\n')
  return root
}

describe('the table of known keys', () => {
  it(
    'is generated from the schema and committed byte for byte',
    { timeout: GENERATION_TIMEOUT_MS },
    () => {
      const committed = readFileSync(resolve(KNOWN_KEYS_FILE), 'utf8')
      const regenerated = JSON.stringify(buildKnownKeys(buildProjectSchema()), null, JSON_INDENT)
      expect(regenerated + '\n').toEqual(committed)
    },
  )

  it(
    'makes the schema check fail and name the file when the committed table is stale',
    { timeout: GENERATION_TIMEOUT_MS },
    () => {
      const root = makeRepositoryWithStaleTable()
      try {
        const script = resolve('scripts/schema/generate-schema.mjs')
        const result = spawnSync(process.execPath, [script, '--check'], {
          cwd: root,
          encoding: 'utf8',
        })
        expect(result.status).not.toBe(0)
        expect(result.stderr).toContain(KNOWN_KEYS_FILE)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )

  it('treats a map of typed values as a collection the model owns', () => {
    expect(KNOWN_KEYS.Project.keys.roomOverrides).toMatchObject({
      kind: 'map',
      value: { kind: 'object', type: 'RoomOverride' },
    })
    expect(KNOWN_KEYS.Project.keys.paint).toMatchObject({
      kind: 'map',
      value: { kind: 'union' },
    })
    expect(KNOWN_KEYS.ProjectMeta.keys.registryVersions).toEqual({
      kind: 'map',
      value: { kind: 'leaf' },
    })
  })

  it('treats a value the schema leaves open as opaque', () => {
    expect(KNOWN_KEYS.FurnitureInstance.keys.customizations).toEqual({ kind: 'opaque' })
    for (const name of typesWithExtensions()) {
      expect(KNOWN_KEYS[name].keys.extensions, name).toEqual({ kind: 'opaque' })
    }
  })

  it('lists the optional keys of a type', () => {
    expect(KNOWN_KEYS.ProjectMeta.optional).toContain('style')
    expect(KNOWN_KEYS.Floor.optional).toContain('periodOverride')
  })

  it('names exactly the types that carry extensions, the root included', () => {
    expect([...typesWithExtensions()].sort()).toEqual(TYPES_WITH_EXTENSIONS)
  })
})
