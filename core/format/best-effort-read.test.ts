import { describe, expect, it } from 'vitest'
import { versionFixtureBytes } from '../../tests/fixtures/projects/versions'
import { CURRENT_SCHEMA_VERSION } from '../index'
import { bestEffortProjectName } from './best-effort-read'

const OLDEST_FIXTURE_VERSION = 8
const INVALID_UTF8_BYTES = new Uint8Array([0xff, 0xfe, 0x7b, 0xc3, 0x28])

type Json = Record<string, unknown>

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

function fixtureDocument(version: number): Json {
  return JSON.parse(new TextDecoder().decode(versionFixtureBytes(version))) as Json
}

function nameOf(document: Json): string {
  return (document.meta as { name: string }).name
}

function bytesOf(document: Json): Uint8Array {
  return encode(JSON.stringify(document))
}

describe('reading the name of a stored project without decoding it', () => {
  it('returns the name of a document at the current version', () => {
    const document = fixtureDocument(CURRENT_SCHEMA_VERSION)

    expect(bestEffortProjectName(bytesOf(document))).toBe(nameOf(document))
  })

  it('returns the name of a version 8 document without migrating it', () => {
    const document = fixtureDocument(OLDEST_FIXTURE_VERSION)

    expect(bestEffortProjectName(bytesOf(document))).toBe(nameOf(document))
  })

  it('returns the name of a document at a version above the build', () => {
    const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
    ;(document.meta as Json).schemaVersion = CURRENT_SCHEMA_VERSION + 1

    expect(bestEffortProjectName(bytesOf(document))).toBe(nameOf(document))
  })

  it('returns the name of a document that breaks the format rules', () => {
    const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
    document.unknownTopLevelField = 1

    expect(bestEffortProjectName(bytesOf(document))).toBe(nameOf(document))
  })
})

describe('reading the name of bytes that hold no readable name', () => {
  it.each([
    { name: 'bytes that are not JSON', text: '{ this is not json' },
    { name: 'an empty array', text: '[]' },
    { name: 'null', text: 'null' },
    { name: 'an empty object', text: '{}' },
    { name: 'a meta that is not an object', text: '{"meta":"House"}' },
    { name: 'a meta that is null', text: '{"meta":null}' },
    { name: 'a meta with no name', text: '{"meta":{}}' },
    { name: 'a name that is a number', text: '{"meta":{"name":7}}' },
    { name: 'a name that is null', text: '{"meta":{"name":null}}' },
  ])('returns undefined for $name', ({ text }) => {
    expect(bestEffortProjectName(encode(text))).toBeUndefined()
  })

  it('does not throw for bytes that are not valid UTF-8', () => {
    expect(() => bestEffortProjectName(INVALID_UTF8_BYTES)).not.toThrow()
    expect(bestEffortProjectName(INVALID_UTF8_BYTES)).toBeUndefined()
  })
})
