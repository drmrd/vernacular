import { describe, expect, it } from 'vitest'
import type { ReadFailure } from '../../core'
import { DocumentDecodeError } from './document-decode-error'

const STORED_NEWER_VERSION = 18
const BUILD_VERSION = 17
const MIGRATION_START_VERSION = 8

const newerVersion: ReadFailure = {
  kind: 'newer-version',
  version: STORED_NEWER_VERSION,
  buildVersion: BUILD_VERSION,
}
const migrationFailed: ReadFailure = {
  kind: 'migration-failed',
  fromVersion: MIGRATION_START_VERSION,
  message: 'the step from 9 is missing',
}
const notJson: ReadFailure = { kind: 'not-json', message: 'Unexpected token' }
const notAProject: ReadFailure = { kind: 'not-a-project' }

describe('DocumentDecodeError', () => {
  it('names the stored version and the version of the build for a newer document', () => {
    const { message } = new DocumentDecodeError(newerVersion)

    expect(message).toContain(String(STORED_NEWER_VERSION))
    expect(message).toContain(String(BUILD_VERSION))
  })

  it('names the stored version and the reason when a migration failed', () => {
    const { message } = new DocumentDecodeError(migrationFailed)

    expect(message).toContain(String(MIGRATION_START_VERSION))
    expect(message).toContain('the step from 9 is missing')
  })

  it('carries the parser message when the bytes are not JSON', () => {
    const { message } = new DocumentDecodeError(notJson)

    expect(message).toContain('Unexpected token')
  })

  it('says the file is not a project of this application when it has no project shape', () => {
    const { message } = new DocumentDecodeError(notAProject)

    expect(message.toLowerCase()).toContain('not a')
    expect(message.toLowerCase()).toContain('project')
  })

  it.each([newerVersion, migrationFailed, notJson, notAProject])(
    'says more than the bare kind name for a $kind failure and keeps the failure',
    (failure) => {
      const error = new DocumentDecodeError(failure)

      expect(error).toBeInstanceOf(Error)
      expect(error.failure).toBe(failure)
      expect(error.message.endsWith(failure.kind)).toBe(false)
      expect(error.message.trim()).not.toBe(failure.kind)
    },
  )
})
