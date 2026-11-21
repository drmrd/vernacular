import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearLegacyActiveProjectId } from '../../storage/active-project/legacy-active-project-id-test-kit'
import { rememberFolder } from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import { reconcileIndex } from '..'
import {
  documentNamed,
  holdReadOf,
  placeSound,
  rebuildPorts,
  soundRecordOf,
} from './rebuild-test-kit'

beforeEach(() => {
  clearLegacyActiveProjectId()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  clearLegacyActiveProjectId()
})

/** A promise that never settles, as a query of a store that never answers gives. */
function neverAnswers(): Promise<never> {
  return new Promise<never>(() => undefined)
}

/** Durable ports whose store holds the sound project current and a folder handle under its id. */
async function portsWithOldFolder(): Promise<TestPorts> {
  const ports = rebuildPorts({ durable: true })
  await placeSound(ports, ['current'])
  await rememberFolder(ports, 'current', documentNamed('In the folder'))
  return ports
}

/** Waits until `rebuilding` resolves, within the limit of `vi.waitFor`, and gives its value. */
async function valueOnceSettled<T>(rebuilding: Promise<T>): Promise<T> {
  const settled = vi.fn<(value: T) => void>()
  void rebuilding.then(settled)
  await vi.waitFor(() => expect(settled).toHaveBeenCalledOnce())
  return rebuilding
}

/** Runs the rebuild two times, one after the other, and expects each to resolve with its record. */
async function expectTwoRebuildsToSettle(ports: TestPorts): Promise<void> {
  expect(await valueOnceSettled(reconcileIndex(ports))).toEqual([soundRecordOf('current')])
  expect(await ports.index.all()).toEqual([soundRecordOf('current')])

  expect(await valueOnceSettled(reconcileIndex(ports))).toEqual([soundRecordOf('current')])
}

describe('a folder query of the upgrade that never answers', () => {
  it('a permission query that never answers does not hold the rebuild, and the next call is not held either', async () => {
    const ports = await portsWithOldFolder()
    const permission = vi.spyOn(ports.folders, 'permission').mockReturnValue(neverAnswers())

    await expectTwoRebuildsToSettle(ports)

    expect(permission).toHaveBeenCalledWith('current')
  })

  it('a forget that never answers does not hold the rebuild, and the next call is not held either', async () => {
    const ports = await portsWithOldFolder()
    const forget = vi.spyOn(ports.folders, 'forget').mockReturnValue(neverAnswers())

    await expectTwoRebuildsToSettle(ports)

    expect(forget).toHaveBeenCalledWith('current')
  })

  it('with a permission query that never answers, a second call made while the first run is still open settles as well', async () => {
    const ports = await portsWithOldFolder()
    const permission = vi.spyOn(ports.folders, 'permission').mockReturnValue(neverAnswers())
    const read = holdReadOf(ports, 'current')

    const firstCall = reconcileIndex(ports)
    await vi.waitFor(() => expect(read.started()).toBe(true))
    expect(permission).toHaveBeenCalledWith('current')
    const secondCall = reconcileIndex(ports)
    read.release()

    expect(await valueOnceSettled(firstCall)).toEqual([soundRecordOf('current')])
    expect(await valueOnceSettled(secondCall)).toEqual([soundRecordOf('current')])
  })
})
