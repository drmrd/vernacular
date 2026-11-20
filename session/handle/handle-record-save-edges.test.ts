import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { gatePuts } from '../../storage/project-index/project-record-test-kit'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import { settle } from '../autosave/save-gate-test-kit'
import type { DocumentHandle } from './handle-types'
import {
  createTestPorts,
  failSaves,
  follow,
  hideTimesOfChange,
  movableClock,
  openOrThrow,
  placeDocument,
  recordOf,
  rename,
  workspaceRequest,
} from './handle-test-kit'
import type { TestPortsOptions, TestPorts } from './handle-test-kit'

const PROJECT_ID = 'a'
const OPENED_AT = new Date('2026-11-10T09:00:00.000Z')
const SAVED_AT = new Date('2026-11-10T10:00:00.000Z')
const PUT_STARTED_AT = new Date('2026-11-10T11:00:00.000Z')
const RESOLVED_OK = { status: 'resolved', outcome: { ok: true } }

let consoleWarn: ReturnType<typeof vi.spyOn>

/** The ports, and a handle on the stored project `a` whose open record is written. */
async function openStored(
  options: TestPortsOptions = {},
): Promise<{ ports: TestPorts; handle: DocumentHandle }> {
  const ports = createTestPorts(options)
  await placeDocument(ports, PROJECT_ID, currentBytes())
  const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
  await settle()
  return { ports, handle }
}

/** The names of the records whose put started, in the order they started. */
function startedNames(puts: ReturnType<typeof gatePuts>): (string | undefined)[] {
  return puts.startedRecords().map((record) => record.name)
}

beforeEach(() => {
  vi.useFakeTimers()
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the record of a save in the order of the writes', () => {
  it('a close waits for a record request that waits as well as for the one that runs', async () => {
    const { ports, handle } = await openStored()
    const puts = gatePuts(ports.index)
    rename(handle, 'First')
    await handle.save()
    rename(handle, 'Second')
    await handle.save()

    const closing = follow(handle.close())
    await settle()
    expect(closing()).toEqual({ status: 'pending' })
    puts.endOldestPut()
    await settle()
    expect(puts.started()).toBe(2)
    expect(closing()).toEqual({ status: 'pending' })
    puts.endOldestPut()
    await settle()

    expect(closing()).toEqual(RESOLVED_OK)
    expect(await ports.index.get(PROJECT_ID)).toMatchObject({ name: 'Second' })
  })

  it('the time of use of a record is the time of its saved write, not the time its put starts', async () => {
    const clock = movableClock(OPENED_AT)
    const { ports, handle } = await openStored({ now: clock.now })
    const puts = gatePuts(ports.index)
    rename(handle, 'First')
    await handle.save()
    clock.moveTo(SAVED_AT)
    rename(handle, 'Second')
    await handle.save()

    clock.moveTo(PUT_STARTED_AT)
    puts.endOldestPut()
    await settle()
    puts.endAllPuts()

    expect(await recordOf(ports, PROJECT_ID)).toMatchObject({
      name: 'Second',
      lastUsedAt: SAVED_AT.toISOString(),
    })
  })

  it('a failed write after a saved one starts no record write', async () => {
    const { ports, handle } = await openStored()
    rename(handle, 'Saved')
    await handle.save()
    await settle()
    const put = vi.spyOn(ports.index, 'put')
    failSaves(ports.workspace)
    rename(handle, 'Not stored')

    expect(await handle.save()).toMatchObject({ ok: false })
    await settle()

    expect(put).not.toHaveBeenCalled()
    expect(await ports.index.get(PROJECT_ID)).toMatchObject({ name: 'Saved' })
  })
})

describe('the record of a save when a part of it is missing', () => {
  it('a save whose store cannot tell the time writes a record with no time of change', async () => {
    const { ports, handle } = await openStored()
    expect((await ports.index.get(PROJECT_ID))?.lastChangedAt).toBeDefined()
    hideTimesOfChange(ports)
    rename(handle, 'Saved with no time')

    expect(await handle.save()).toEqual({ ok: true })

    const record = await recordOf(ports, PROJECT_ID)
    expect(record?.name).toBe('Saved with no time')
    expect(record?.lastChangedAt).toBeUndefined()
  })

  it('a clock that throws leaves the save ok, writes no record, and warns once', async () => {
    let clockWorks = true
    const now = (): Date => {
      if (clockWorks) return new Date()
      throw new Error('the clock cannot be read')
    }
    const { ports, handle } = await openStored({ now })
    const put = vi.spyOn(ports.index, 'put')
    clockWorks = false
    rename(handle, 'Saved')

    expect(await handle.save()).toEqual({ ok: true })
    await settle()

    expect(put).not.toHaveBeenCalled()
    expect(consoleWarn).toHaveBeenCalledTimes(1)
  })
})

describe('the record of a save after the session changed', () => {
  it('a status listener that edits when the status turns saved stops the record of that write', async () => {
    const { ports, handle } = await openStored()
    const put = vi.spyOn(ports.index, 'put')
    let edited = false
    handle.subscribe(() => {
      if (edited || handle.saveStatus() !== 'saved') return
      edited = true
      rename(handle, 'Edited by a listener')
    })
    rename(handle, 'Saved')

    expect(await handle.save()).toEqual({ ok: true })
    await settle()

    expect(edited).toBe(true)
    expect(put).not.toHaveBeenCalled()
  })

  it('an undo after a saved write drops the record that waits, and the next saved write records again', async () => {
    const { ports, handle } = await openStored()
    const puts = gatePuts(ports.index)
    rename(handle, 'First')
    await handle.save()
    rename(handle, 'Second')
    await handle.save()

    expect(handle.session.undo()).toBe(true)
    puts.endOldestPut()
    await settle()
    expect(startedNames(puts)).toEqual(['First'])

    expect(await handle.save()).toEqual({ ok: true })
    await settle()
    puts.endAllPuts()
    expect(startedNames(puts)).toEqual(['First', 'First'])
    expect(await recordOf(ports, PROJECT_ID)).toMatchObject({ name: 'First' })
  })
})
