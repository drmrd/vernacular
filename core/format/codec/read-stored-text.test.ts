import { describe, expect, it } from 'vitest'
import { versionFixtureBytes } from '../../../tests/fixtures/projects/versions'
import {
  fixtureDocument,
  metaOf,
} from '../../../tests/fixtures/projects/versions/fixture-documents'
import { CURRENT_SCHEMA_VERSION } from '../../index'
import { bestEffortProjectName } from '../best-effort-read'
import { decodeDocument } from './decode-document'

const REPLACEMENT_CHARACTER = '�'
const LATIN_1_E_ACUTE = 0xe9
const LETTER_TO_REPLACE_INDEX = 3

/** The name in the version 17 fixture: "Alder Street Cottage". */
function fixtureName(): string {
  return metaOf(fixtureDocument(CURRENT_SCHEMA_VERSION)).name as string
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  return haystack.findIndex((_byte, start) =>
    needle.every((byte, i) => haystack[start + i] === byte),
  )
}

/** The fixture bytes with the letter at LETTER_TO_REPLACE_INDEX of meta.name as one Latin-1 byte. */
function bytesWithLatin1InName(): Uint8Array {
  const bytes = versionFixtureBytes(CURRENT_SCHEMA_VERSION)
  const nameStart = indexOfBytes(bytes, new TextEncoder().encode(fixtureName()))
  if (nameStart < 0) throw new Error('The fixture bytes do not hold the project name')
  bytes[nameStart + LETTER_TO_REPLACE_INDEX] = LATIN_1_E_ACUTE
  return bytes
}

function nameWithReplacement(): string {
  const name = [...fixtureName()]
  name[LETTER_TO_REPLACE_INDEX] = REPLACEMENT_CHARACTER
  return name.join('')
}

describe('reading stored text that holds a byte that is not valid UTF-8', () => {
  it('decodes the document and puts the replacement character where the byte was', () => {
    const result = decodeDocument(bytesWithLatin1InName())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.project.meta.name).toBe(nameWithReplacement())
    expect(result.value.project.meta.name).toContain(REPLACEMENT_CHARACTER)
  })

  it('reads the same name without decoding the document', () => {
    expect(bestEffortProjectName(bytesWithLatin1InName())).toBe(nameWithReplacement())
  })

  it('still reports bytes that are not JSON at all as not-json', () => {
    const result = decodeDocument(new TextEncoder().encode('{ this is not json'))

    expect(!result.ok && result.failure.kind).toBe('not-json')
  })
})
