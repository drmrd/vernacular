import { describe, expect, it, vi } from 'vitest'
import { findDocumentStore } from '../handle/find-document-store'
import type { OpenFailure } from '../handle/handle-types'
import { FIRST_ID, storeTwoProjects } from './card-flows-test-kit'
import { exportProject } from './export-project'

vi.mock('../handle/find-document-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../handle/find-document-store')>()
  return { ...actual, findDocumentStore: vi.fn(actual.findDocumentStore) }
})

const FAILURES: readonly OpenFailure[] = [
  { kind: 'open-elsewhere' },
  { kind: 'did-not-open', decode: { kind: 'not-a-project' } },
]

describe('an export whose store lookup fails in a way the export does not name', () => {
  it.each(FAILURES)('gives export-failed that names the $kind failure', async (failure) => {
    const ports = await storeTwoProjects()
    vi.mocked(findDocumentStore).mockResolvedValueOnce({ ok: false, failure })

    const result = await exportProject(ports, undefined, { id: FIRST_ID })

    expect(result).toEqual({
      ok: false,
      failure: {
        kind: 'export-failed',
        message: `The project could not be read (${failure.kind}).`,
      },
    })
  })
})
