import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestPorts, storedName } from '../session/handle/handle-test-kit'
import { createMemoryAddressBar } from './address-bar'
import {
  NEW_PROJECT_NAME,
  lockedIds,
  plantFailedProject,
  secondTab,
  settleForAWhile,
  storedIds,
} from './app-test-support'
import {
  FIRST_ID,
  SECOND_ID,
  addressOf,
  durablePortsWith,
  editorOf,
  nameOf,
  pageOf,
  renderNavigation,
} from './history-navigation-test-support'
import { holdIndexReads } from './held-index-test-support'

const FIRST_ADDRESS = addressOf(FIRST_ID)

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('the history when the ports change', () => {
  it('reads the address again on new ports and opens their project', async () => {
    const oldPorts = createTestPorts({ durable: true })
    await plantFailedProject(oldPorts)
    const newPorts = await durablePortsWith(SECOND_ID)
    const { result, changePorts } = renderNavigation(oldPorts, createMemoryAddressBar())
    await pageOf(result)
    const releaseNewPorts = holdIndexReads(newPorts.index)

    changePorts(newPorts)
    await act(async () => {})

    expect(result.current.handle).toBeNull()
    expect(lockedIds(newPorts)).toEqual([])
    await act(async () => releaseNewPorts())
    expect((await editorOf(result)).id).toBe(SECOND_ID)
    expect(lockedIds(oldPorts)).toEqual([])
  })

  it('a start read of the old ports that ends after the ports changed opens nothing', async () => {
    const oldPorts = await durablePortsWith(FIRST_ID)
    const newPorts = await durablePortsWith(SECOND_ID)
    const releaseOldPorts = holdIndexReads(oldPorts.index)
    const { result, changePorts } = renderNavigation(oldPorts, createMemoryAddressBar())
    await act(async () => {})

    changePorts(newPorts)
    const handle = await editorOf(result)
    await act(async () => releaseOldPorts())
    await settleForAWhile()

    expect(handle.id).toBe(SECOND_ID)
    expect(result.current.handle).toBe(handle)
    expect(lockedIds(oldPorts)).toEqual([])
    expect(lockedIds(newPorts)).toEqual([SECOND_ID])
  })
})

describe('the history of two tabs and of a project asked for early', () => {
  it('a second tab at the same address says that the project is open in another tab and keeps the address', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    const firstTab = renderNavigation(ports, createMemoryAddressBar())
    const handle = await editorOf(firstTab.result)
    const bar = createMemoryAddressBar(FIRST_ADDRESS)

    const { result } = renderNavigation(secondTab(ports), bar)
    const page = await pageOf(result)

    expect(page.notice).toStrictEqual({ id: FIRST_ID, failure: { kind: 'open-elsewhere' } })
    expect(result.current.handle).toBeNull()
    expect(bar.entries()).toEqual([FIRST_ADDRESS])
    expect(firstTab.result.current.handle).toBe(handle)
    expect(lockedIds(ports)).toEqual([FIRST_ID])
  })

  it('starts the new project that was asked for before the ports came', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    const bar = createMemoryAddressBar(FIRST_ADDRESS)
    const { result, changePorts } = renderNavigation(null, bar)

    act(() => result.current.startFresh())
    changePorts(ports)

    const handle = await editorOf(result)
    expect(handle.id).not.toBe(FIRST_ID)
    expect(handle.session.getProject().meta.name).toBe(NEW_PROJECT_NAME)
    expect(lockedIds(ports)).toEqual([handle.id])
    await waitFor(() => expect(bar.hash()).toBe(''))
    expect(bar.entries()).toEqual([FIRST_ADDRESS, ''])
    expect(await storedIds(ports)).toEqual([FIRST_ID])
    expect(await storedName(ports.workspace, FIRST_ID)).toBe(nameOf(FIRST_ID))
  })
})
