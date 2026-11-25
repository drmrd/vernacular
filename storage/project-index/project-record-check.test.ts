import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../core'
import { secondDocumentFileName } from '../project-files/project-file-name'
import { isProjectRecord } from './project-record-check'
import { sampleRecord } from './project-record-test-kit'

const SECOND_FILE_NAME = secondDocumentFileName(CURRENT_SCHEMA_VERSION)

/** A whole record as stored, with its `secondFile` field set to `value`. */
function recordWithSecondFile(value: unknown): unknown {
  return { ...sampleRecord(), secondFile: value }
}

describe('the check of a stored project record for its second file', () => {
  it('accepts a record that has no secondFile field', () => {
    expect(isProjectRecord(sampleRecord())).toBe(true)
  })

  it.each(['main', 'second'])(
    'accepts a secondFile that names the file and was read as %s',
    (read) => {
      expect(isProjectRecord(recordWithSecondFile({ name: SECOND_FILE_NAME, read }))).toBe(true)
    },
  )

  it.each([
    ['a name that is no text', { name: 42, read: 'second' }],
    ['no name', { read: 'second' }],
    ['a read that is neither main nor second', { name: SECOND_FILE_NAME, read: 'both' }],
    ['no read', { name: SECOND_FILE_NAME }],
    ['a value that is no object', SECOND_FILE_NAME],
    ['null', null],
  ])('refuses a record whose secondFile has %s', (_what, secondFile) => {
    expect(isProjectRecord(recordWithSecondFile(secondFile))).toBe(false)
  })
})
