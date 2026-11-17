import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_REVISION } from '../../core'
import {
  buildProjectSchema,
  driftVerdict,
  SCHEMA_REVISION,
  SCHEMA_VERSION,
  schemaPath,
} from '../../scripts/schema/build-schema.mjs'

const JSON_INDENT = 2

// Regenerating the VFPF schema from the TypeScript types is CPU-bound and can
// exceed Vitest's 5s per-test default when the full unit suite saturates the
// worker pool, even though it finishes in about a second in isolation.
const SCHEMA_BUILD_TIMEOUT_MS = 30_000

// The versions published before revisions existed. Their files and `$id`
// values are fixed once released and count as revision 0.
const FIRST_FIXED_VERSION = 8
const LAST_FIXED_VERSION = 17
const FIXED_VERSIONS = Array.from(
  { length: LAST_FIXED_VERSION - FIRST_FIXED_VERSION + 1 },
  (_, index) => FIRST_FIXED_VERSION + index,
)

const SCHEMA_ADDRESS = 'https://drmrd.github.io/vernacular/schema'

function expectedId(version: number, revision: number): string {
  const folder = revision === 0 ? `${version}` : `${version}/revision-${revision}`
  return `${SCHEMA_ADDRESS}/${folder}/vernacular.schema.json`
}

function readSchemaText(version: number, revision: number): string {
  return readFileSync(resolve(schemaPath(version, revision)), 'utf8')
}

describe('where a schema is published', () => {
  it('keeps revision 0 at the existing path and puts a later revision in its own folder', () => {
    expect(schemaPath(17, 0)).toBe('schema/17/vernacular.schema.json')
    expect(schemaPath(17, 1)).toBe('schema/17/revision-1/vernacular.schema.json')
  })

  it('follows the version and the revision it is given', () => {
    expect(schemaPath(18, 0)).toBe('schema/18/vernacular.schema.json')
    expect(schemaPath(18, 3)).toBe('schema/18/revision-3/vernacular.schema.json')
  })
})

describe('the revision of this build', () => {
  it('is the revision the model writes into a document', () => {
    expect(Number.isInteger(CURRENT_SCHEMA_REVISION)).toBe(true)
    expect(SCHEMA_REVISION).toBe(CURRENT_SCHEMA_REVISION)
  })

  // A deliberate reminder: this case changes at every version or revision bump, so that the
  // schema of the new number is published before the bump lands.
  it('is revision 1 while the version is 17', () => {
    expect(SCHEMA_VERSION).toBe(LAST_FIXED_VERSION)
    expect(SCHEMA_REVISION).toBe(1)
  })
})

describe('VFPF schema drift guard', () => {
  it(
    'the committed schema matches the schema generated from the types',
    { timeout: SCHEMA_BUILD_TIMEOUT_MS },
    () => {
      const committed = readSchemaText(SCHEMA_VERSION, SCHEMA_REVISION)
      const regenerated = JSON.stringify(buildProjectSchema(), null, JSON_INDENT) + '\n'
      expect(regenerated).toEqual(committed)
    },
  )

  it('the committed schema carries the published address of its version and revision', () => {
    const committed = JSON.parse(readSchemaText(SCHEMA_VERSION, SCHEMA_REVISION)) as {
      $id: string
    }
    expect(committed.$id).toBe(expectedId(SCHEMA_VERSION, SCHEMA_REVISION))
  })
})

describe('driftVerdict', () => {
  const sameNumbers = { version: 17, revision: 1, committedVersion: 17, committedRevision: 1 }

  it('passes when the committed and the regenerated schema are equal', () => {
    expect(driftVerdict('{"a":1}\n', '{"a":1}\n', sameNumbers)).toEqual({ ok: true })
  })

  it('fails a changed schema when neither the version nor the revision rose', () => {
    const verdict = driftVerdict('{"a":1}\n', '{"a":2}\n', sameNumbers)
    expect(verdict.ok).toBe(false)
  })

  it('tells the developer to raise the version or the revision when it fails', () => {
    const verdict = driftVerdict('{"a":1}\n', '{"a":2}\n', sameNumbers)
    expect(verdict.ok).toBe(false)
    const message = (verdict.ok ? '' : verdict.message).toLowerCase()
    expect(message).toContain('raise')
    expect(message).toContain('version')
    expect(message).toContain('revision')
  })

  it('passes a changed schema when the revision rose', () => {
    const numbers = { ...sameNumbers, revision: 2 }
    expect(driftVerdict('{"a":1}\n', '{"a":2}\n', numbers)).toEqual({ ok: true })
  })

  it('passes a changed schema when the version rose, even with a lower revision', () => {
    const numbers = { ...sameNumbers, version: 18, revision: 0 }
    expect(driftVerdict('{"a":1}\n', '{"a":2}\n', numbers)).toEqual({ ok: true })
  })

  it('fails a changed schema when the numbers fell below the committed ones', () => {
    const numbers = { ...sameNumbers, revision: 0 }
    expect(driftVerdict('{"a":1}\n', '{"a":2}\n', numbers).ok).toBe(false)
  })

  it('passes when a raised number has no committed schema yet', () => {
    const numbers = { ...sameNumbers, revision: 2 }
    expect(driftVerdict(null, '{"a":2}\n', numbers)).toEqual({ ok: true })
  })
})

describe('schemas published before revisions existed', () => {
  function publishedVersions(): number[] {
    return readdirSync(resolve('schema'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map((entry) => Number(entry.name))
      .sort((a, b) => a - b)
  }

  it('are all still present at their existing paths', () => {
    expect(publishedVersions()).toEqual(expect.arrayContaining(FIXED_VERSIONS))
    for (const version of FIXED_VERSIONS) {
      expect(existsSync(resolve(schemaPath(version, 0)))).toBe(true)
    }
  })

  it('keep the identifier they were published with', () => {
    for (const version of FIXED_VERSIONS) {
      const schema = JSON.parse(readSchemaText(version, 0)) as { $id: string }
      expect(schema.$id).toBe(expectedId(version, 0))
    }
  })

  it('do not describe a revision, because revision 0 is fixed once released', () => {
    for (const version of FIXED_VERSIONS) {
      expect(readSchemaText(version, 0)).not.toContain('schemaRevision')
    }
  })
})
