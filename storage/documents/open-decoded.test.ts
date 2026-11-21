import { describe, expect, it } from 'vitest'
import {
  bytesOf,
  fixtureDocument,
  withUnknownWallField,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import { DocumentDecodeError } from './document-decode-error'
import { openDecodedDocument } from './open-decoded'

const OLDER_VERSION = 8

/** The error that opening `bytes` throws; fails when it opens. */
function errorOfOpening(bytes: Uint8Array): unknown {
  try {
    openDecodedDocument(bytes)
  } catch (error) {
    return error
  }
  throw new Error('Expected the document not to open')
}

describe('the storage entry', () => {
  it('throws for a document that only breaks the format rules, with the failure', () => {
    const error = errorOfOpening(bytesOf(withUnknownWallField(fixtureDocument(OLDER_VERSION))))

    expect(error).toBeInstanceOf(DocumentDecodeError)
    expect((error as DocumentDecodeError).failure).toMatchObject({
      kind: 'format-rules',
      migratedFrom: OLDER_VERSION,
    })
  })
})
