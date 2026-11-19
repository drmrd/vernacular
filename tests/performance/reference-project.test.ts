import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEditorSession } from '../../session/testing'
import { createDocumentValidator } from '../../core'
import { SCHEMA_VERSION } from '../../scripts/schema/build-schema.mjs'
import recordedSizes from './baseline-sizes.json'
import { DIMENSIONS_PER_FLOOR } from './reference-dimensions'
import { REFERENCE_EDITS, createReferenceProject } from './reference-project'
import { measureProjectSizes } from './reference-sizes'

const schemaPath = resolve('schema', String(SCHEMA_VERSION), 'vernacular.schema.json')
const validate = createDocumentValidator(JSON.parse(readFileSync(schemaPath, 'utf8')))

describe('the reference project', () => {
  it('is the same document on every call', () => {
    const first = createReferenceProject()
    const second = createReferenceProject()

    expect(first).toEqual(second)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it('has the sizes recorded in the performance baseline', () => {
    expect(measureProjectSizes(createReferenceProject())).toEqual(recordedSizes)
  })

  it('meets the project size that the design specification budgets for', () => {
    const sizes = measureProjectSizes(createReferenceProject())

    expect(sizes.floors).toBe(4)
    expect(sizes.furniture).toBe(200)
    expect(sizes.openings + sizes.stairs).toBe(50)
    expect(sizes.paintedSurfaces).toBeGreaterThan(0)
  })

  it('gives every floor the same dimensions, so the plan dimension pass has work to draw', () => {
    const { floors } = createReferenceProject()

    for (const floor of floors) {
      expect(floor.dimensions).toHaveLength(DIMENSIONS_PER_FLOOR)
    }
    expect(measureProjectSizes(createReferenceProject()).dimensions).toBe(
      DIMENSIONS_PER_FLOOR * floors.length,
    )
  })

  it('passes the schema validator', () => {
    const document: unknown = JSON.parse(JSON.stringify(createReferenceProject()))

    expect(validate(document).errors).toEqual([])
    expect(validate(document).valid).toBe(true)
  })

  it('names the six gated edits', () => {
    expect(REFERENCE_EDITS.map((edit) => edit.name)).toEqual([
      'move-wall-endpoint',
      'move-furniture',
      'resize-opening',
      'paint-surface',
      'set-ceiling-height',
      'rename-project',
    ])
  })

  it.each(REFERENCE_EDITS)(
    'the $name edit is a command the real registry accepts and that changes the document',
    (edit) => {
      const original = createReferenceProject()
      const session = createEditorSession(structuredClone(original))

      expect(() => session.dispatch(edit.command(original))).not.toThrow()
      expect(session.getProject()).not.toEqual(original)
    },
  )
})
