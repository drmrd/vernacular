import { spawnSync } from 'node:child_process'
import {
  existsSync,
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
import { CURRENT_SCHEMA_REVISION, CURRENT_SCHEMA_VERSION } from '../../core'
import type { FormatFault } from '../../core'
import { checkCurrentSchema } from '../../core/format/current-schema'
import { SCHEMA_REVISION, SCHEMA_VERSION, schemaPath } from '../../scripts/schema/build-schema.mjs'
import {
  STRICT_DECLARATION_PATH,
  STRICT_VALIDATOR_PATH,
  TOLERANT_DECLARATION_PATH,
  TOLERANT_VALIDATOR_PATH,
} from '../../scripts/schema/build-validators.mjs'
import {
  firstWallOf,
  fixtureDocument,
  metaOf,
  paintKeyOfKind,
  UNKNOWN_FIELD,
} from '../fixtures/projects/versions/fixture-documents'
import type { Json } from '../fixtures/projects/versions/fixture-documents'

// The schema check regenerates the schema from the TypeScript types, which is
// CPU-bound and can exceed Vitest's 5s per-test default under load.
const CHECK_TIMEOUT_MS = 30_000

const NAMESPACE = 'com.example.solar'
const REVISION_THAT_IS_NOT_WHOLE = 1.5
const REVISION_BELOW_ZERO = -2

/** A fresh, complete document of the current version that the schema accepts. */
function currentDocument(): Json {
  return fixtureDocument(CURRENT_SCHEMA_VERSION)
}

function escapePointerSegment(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1')
}

function paintEntries(document: Json): Record<string, Json> {
  return document.paint as Record<string, Json>
}

function faultsOf(document: Json, mode: 'strict' | 'tolerant'): FormatFault[] {
  return checkCurrentSchema(document, mode)
}

describe('the current schema check of a document', () => {
  it('accepts the unchanged document of the current version in both modes', () => {
    expect(faultsOf(currentDocument(), 'strict')).toEqual([])
    expect(faultsOf(currentDocument(), 'tolerant')).toEqual([])
  })

  it('reports an unknown root key once in strict mode, at the key itself', () => {
    const document = { ...currentDocument(), [UNKNOWN_FIELD]: 1 }
    const faults = faultsOf(document, 'strict')
    expect(faults).toHaveLength(1)
    expect(faults[0]?.path).toBe('/x-unknown')
    expect(faults[0]?.rule).toBe('additionalProperties')
    expect(faults[0]?.message).not.toBe('')
  })

  it('accepts an unknown root key in tolerant mode', () => {
    const document = { ...currentDocument(), [UNKNOWN_FIELD]: 1 }
    expect(faultsOf(document, 'tolerant')).toEqual([])
  })

  it.each(['solid', 'pattern'])(
    'reports an unknown field in a %s paint entry in strict mode and accepts it in tolerant mode',
    (kind) => {
      const document = currentDocument()
      const key = paintKeyOfKind(document, kind)
      paintEntries(document)[key] = { ...paintEntries(document)[key], [UNKNOWN_FIELD]: true }
      const fieldPath = `/paint/${escapePointerSegment(key)}/x-unknown`

      const strict = faultsOf(document, 'strict')
      expect(strict.map((fault) => fault.path)).toContain(fieldPath)
      expect(strict.find((fault) => fault.path === fieldPath)?.rule).toBe('additionalProperties')
      expect(faultsOf(document, 'tolerant')).toEqual([])
    },
  )

  it('accepts any key inside extensions in both modes', () => {
    const document = currentDocument()
    document.extensions = { [NAMESPACE]: { panelKilowatts: 6.4, [UNKNOWN_FIELD]: [1, 2] } }
    expect(faultsOf(document, 'strict')).toEqual([])
    expect(faultsOf(document, 'tolerant')).toEqual([])
  })

  it.each(['strict', 'tolerant'] as const)(
    'reports a missing project name as a required field in %s mode',
    (mode) => {
      const document = currentDocument()
      delete metaOf(document).name
      const required = faultsOf(document, mode).filter((fault) => fault.rule === 'required')
      expect(required.length).toBeGreaterThan(0)
      expect(required.map((fault) => fault.path)).toContain('/meta')
    },
  )

  it.each(['strict', 'tolerant'] as const)(
    'reports a value of the wrong type on a known field in %s mode',
    (mode) => {
      const document = currentDocument()
      firstWallOf(document).thickness = 'thick'
      const faults = faultsOf(document, mode)
      const typeFault = faults.find((fault) => fault.path === '/floors/0/walls/0/thickness')
      expect(typeFault?.rule).toBe('type')
    },
  )

  it.each([
    { name: 'NaN', value: Number.NaN, mode: 'strict' },
    { name: 'NaN', value: Number.NaN, mode: 'tolerant' },
    { name: 'Infinity', value: Number.POSITIVE_INFINITY, mode: 'strict' },
    { name: 'Infinity', value: Number.POSITIVE_INFINITY, mode: 'tolerant' },
  ] as const)('reports $name on a known number field in $mode mode', ({ value, mode }) => {
    const document = currentDocument()
    firstWallOf(document).thickness = value
    const faults = faultsOf(document, mode)
    expect(faults.length).toBeGreaterThan(0)
    expect(faults.map((fault) => fault.path)).toContain('/floors/0/walls/0/thickness')
  })
})

describe('the schema revision of a document', () => {
  function withRevision(revision: number): Json {
    const document = currentDocument()
    metaOf(document).schemaRevision = revision
    return document
  }

  it.each([
    { name: 'not whole', revision: REVISION_THAT_IS_NOT_WHOLE, mode: 'strict' },
    { name: 'not whole', revision: REVISION_THAT_IS_NOT_WHOLE, mode: 'tolerant' },
    { name: 'below zero', revision: REVISION_BELOW_ZERO, mode: 'strict' },
    { name: 'below zero', revision: REVISION_BELOW_ZERO, mode: 'tolerant' },
  ] as const)('reports a revision that is $name as a fault in $mode mode', ({ revision, mode }) => {
    const faults = faultsOf(withRevision(revision), mode)
    expect(faults.map((fault) => fault.path)).toContain('/meta/schemaRevision')
  })

  it.each([0, CURRENT_SCHEMA_REVISION])('accepts the revision %i in strict mode', (revision) => {
    expect(faultsOf(withRevision(revision), 'strict')).toEqual([])
  })

  it('is described in the published schema as an integer of zero or more', () => {
    const schema = JSON.parse(
      readFileSync(resolve(schemaPath(SCHEMA_VERSION, SCHEMA_REVISION)), 'utf8'),
    ) as { definitions: Record<string, { properties?: Record<string, Json> }> }
    const definition = Object.values(schema.definitions).find(
      (candidate) => candidate.properties?.schemaRevision !== undefined,
    )
    expect(definition?.properties?.schemaRevision).toMatchObject({ type: 'integer', minimum: 0 })
  })
})

/**
 * Lay out a scratch copy of the repository in which every entry is a symlink to
 * the real one, except the file at `path`, which holds `content`, or is left out
 * when `content` is undefined. The schema script reads and writes paths relative
 * to its working directory.
 */
function mirrorWithFile(
  dirs: { real: string; copy: string },
  path: readonly string[],
  content: string | undefined,
): void {
  const [head, ...rest] = path
  if (head === undefined) return
  mkdirSync(dirs.copy, { recursive: true })
  const entries = existsSync(dirs.real) ? readdirSync(dirs.real) : []
  for (const entry of entries) {
    if (entry !== head) symlinkSync(join(dirs.real, entry), join(dirs.copy, entry))
  }
  if (rest.length === 0) {
    if (content !== undefined) writeFileSync(join(dirs.copy, head), content)
    return
  }
  mirrorWithFile({ real: join(dirs.real, head), copy: join(dirs.copy, head) }, rest, content)
}

function runSchemaCheck(file: string, change: (committed: string) => string | undefined) {
  const real = resolve('.')
  const root = mkdtempSync(join(tmpdir(), 'generated-validator-'))
  try {
    const committed = readFileSync(join(real, file), 'utf8')
    mirrorWithFile({ real, copy: root }, file.split('/'), change(committed))
    return spawnSync(process.execPath, [resolve('scripts/schema/generate-schema.mjs'), '--check'], {
      cwd: root,
      encoding: 'utf8',
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('the generated validators under drift control', () => {
  it.each([STRICT_VALIDATOR_PATH, TOLERANT_VALIDATOR_PATH])(
    'makes the schema check fail and name %s when that file is stale',
    { timeout: CHECK_TIMEOUT_MS },
    (file) => {
      const result = runSchemaCheck(file, (committed) => committed + '// stale\n')
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain(file)
    },
  )

  it.each([STRICT_DECLARATION_PATH, TOLERANT_DECLARATION_PATH])(
    'makes the schema check fail and name %s when that declaration is stale',
    { timeout: CHECK_TIMEOUT_MS },
    (file) => {
      const result = runSchemaCheck(file, (committed) => committed + '// stale\n')
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain(file)
    },
  )

  it(
    'lets the schema check pass when both generated validators are fresh',
    { timeout: CHECK_TIMEOUT_MS },
    () => {
      const result = runSchemaCheck(STRICT_VALIDATOR_PATH, (committed) => committed)
      expect(result.status).toBe(0)
    },
  )

  it(
    'makes the schema check fail and name the schema file when that file is absent',
    { timeout: CHECK_TIMEOUT_MS },
    () => {
      const file = schemaPath(SCHEMA_VERSION, SCHEMA_REVISION)
      const result = runSchemaCheck(file, () => undefined)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain(file)
    },
  )
})
