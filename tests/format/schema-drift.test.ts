import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildProjectSchema, SCHEMA_VERSION } from '../../scripts/schema/build-schema.mjs'

const JSON_INDENT = 2

describe('VFPF schema drift guard', () => {
  it('the committed schema matches the schema generated from the types', () => {
    const committed = readFileSync(
      resolve(`schema/${SCHEMA_VERSION}/vernacular.schema.json`),
      'utf8',
    )
    const regenerated = JSON.stringify(buildProjectSchema(), null, JSON_INDENT) + '\n'
    expect(regenerated).toEqual(committed)
  })
})
