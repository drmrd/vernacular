import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { decodeDocument } from '../../core'
import { sampleRecord } from '../../storage/project-index/project-record-test-kit'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import { settle } from '../autosave/save-gate-test-kit'
import {
  createTestPorts,
  openOrThrow,
  placeDocument,
  rename,
  storedName,
  workspaceRequest,
} from '../handle/handle-test-kit'
import { switchProject } from './switch-project'

const CURRENT_ID = 'a'
const TARGET_ID = 'b'
const BUILD = 'build-of-the-switch-tests'
const NOT_JSON = new TextEncoder().encode('{ not json')

/** The kind of the decode failure that `bytes` give; throws when they decode. */
function decodeKindOf(bytes: Uint8Array): string {
  const decoded = decodeDocument(bytes)
  if (decoded.ok) throw new Error('Expected the codec to fail on these bytes')
  return decoded.failure.kind
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the record of the target of a switch that does not open', () => {
  it('a switch whose target does not open returns the failure, notes the reason in the record of the target, and keeps the current project open', async () => {
    const ports = createTestPorts({ build: BUILD })
    await placeDocument(ports, CURRENT_ID, currentBytes())
    await placeDocument(ports, TARGET_ID, NOT_JSON)
    const target = sampleRecord({ id: TARGET_ID })
    await ports.index.put(target)
    const current = await openOrThrow(ports, workspaceRequest(CURRENT_ID))
    await settle()

    const result = await switchProject(ports, current, workspaceRequest(TARGET_ID))

    expect(result).toMatchObject({ ok: false, failure: { kind: 'did-not-open' } })
    expect(await ports.index.get(TARGET_ID)).toEqual({
      ...target,
      lastOpen: { opened: false, build: BUILD, reason: decodeKindOf(NOT_JSON) },
    })
    expect(ports.lockRegistry.has(CURRENT_ID)).toBe(true)
    expect(ports.lockRegistry.has(TARGET_ID)).toBe(false)
    rename(current, 'Still open')
    expect(await current.save()).toEqual({ ok: true })
    expect(await storedName(ports.workspace, CURRENT_ID)).toBe('Still open')
  })
})
