import { describe, expect, it } from 'vitest'
import { parseAssetReference } from '../model/asset-reference.ts'
import { parseCatalogId } from './catalog-id.ts'
import {
  formatSubResource,
  isSubResourceName,
  parseSubResourceText,
  SUB_RESOURCE_KINDS,
  SUB_RESOURCE_SEPARATOR,
} from './sub-resource.ts'

const DOOR_TEXT = 'core:ENV.exterior_doors_entries/four_panel_door_813x2032mm@1.0.0'
const STRIKE_PLATE = { kind: 'socket', name: 'strike_plate' } as const
const SOME_HASH = 'a'.repeat(64)

function doorId() {
  const parsed = parseCatalogId(DOOR_TEXT)
  if (!parsed.ok) throw new Error(parsed.problem)
  return parsed.id
}

describe('sub-resource text form', () => {
  it('writes and reads the text form with a tilde', () => {
    const id = doorId()

    const text = formatSubResource(id, STRIKE_PLATE)

    expect(text.endsWith('@1.0.0~socket:strike_plate')).toBe(true)
    expect(parseSubResourceText(text)).toEqual({ ok: true, id, part: STRIKE_PLATE })
    expect(SUB_RESOURCE_SEPARATOR).toBe('~')
    expect(SUB_RESOURCE_KINDS).toEqual([
      'slot',
      'socket',
      'port',
      'lod',
      'layer',
      'node',
      'zone',
      'volume',
      'morph',
      'rule',
      'stream',
      'void',
    ])
    for (const name of ['lod0', 'plan_symbol', 'ceiling_plan_symbol', 'ab', 'a'.repeat(48)]) {
      expect(isSubResourceName(name)).toBe(true)
    }
    for (const name of ['0lod', 'a', 'Strike', 'a'.repeat(49)]) {
      expect(isSubResourceName(name)).toBe(false)
    }

    const unknownKind = parseSubResourceText(`${DOOR_TEXT}~widget:x_y`)
    expect(unknownKind.ok).toBe(false)
    if (!unknownKind.ok) expect(unknownKind.problem).toContain('kind')
    const badName = parseSubResourceText(`${DOOR_TEXT}~socket:Strike`)
    expect(badName.ok).toBe(false)
    if (!badName.ok) expect(badName.problem).toContain('name')
    const noTilde = parseSubResourceText(DOOR_TEXT)
    expect(noTilde.ok).toBe(false)
    if (!noTilde.ok) expect(noTilde.problem).toMatch(/^kind/)
    const noColon = parseSubResourceText(`${DOOR_TEXT}~socket`)
    expect(noColon.ok).toBe(false)
    if (!noColon.ok) expect(noColon.problem).toMatch(/^name/)
  })

  it('names the part of a malformed sub-resource text', () => {
    const cases: readonly (readonly [string, RegExp])[] = [
      [`${DOOR_TEXT}~socket:strike~plate`, /^name/],
      [`${DOOR_TEXT}~~socket:ab`, /^kind/],
      [`${DOOR_TEXT}~socket:strike_plate~socket:x`, /^name/],
      [`${DOOR_TEXT}~socket:strike:plate`, /^name/],
      [`${DOOR_TEXT}~widget`, /^kind/],
      [`${DOOR_TEXT}~`, /^kind/],
      [`${DOOR_TEXT}~socket`, /^name/],
    ]

    for (const [text, expected] of cases) {
      const parsed = parseSubResourceText(text)
      expect(parsed.ok, text).toBe(false)
      if (!parsed.ok) expect(parsed.problem, text).toMatch(expected)
    }
  })

  it('a sub-resource text is never an asset reference', () => {
    const text = formatSubResource(doorId(), STRIKE_PLATE)

    expect(text).not.toContain('#')
    expect(parseSubResourceText(`pack:vernacular-starter@1.0.0#${SOME_HASH}`).ok).toBe(false)
    expect(parseSubResourceText(`${text}#${SOME_HASH}`).ok).toBe(false)
    let contentHash = ''
    try {
      contentHash = parseAssetReference(text).contentHash
    } catch {
      return
    }
    expect(contentHash).not.toMatch(/^[0-9a-f]{64}$/)
  })
})
