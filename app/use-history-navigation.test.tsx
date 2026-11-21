import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isStored } from '../session'
import { settle } from '../session/autosave/save-gate-test-kit'
import { createTestPorts } from '../session/handle/handle-test-kit'
import { createMemoryAddressBar } from './address-bar'
import {
  NEW_PROJECT_NAME,
  lockedIds,
  reloadOf,
  settleForAWhile,
  storedIds,
  usedLast,
} from './app-test-support'
import {
  FIRST_ADDRESS,
  FIRST_ID,
  MISSING_ADDRESS,
  MISSING_ID,
  NOT_FOUND,
  PROJECTS_ADDRESS,
  SECOND_ADDRESS,
  SECOND_ID,
  THIRD_ID,
  addressOf,
  durablePortsWith,
  editAndSave,
  editorOf,
  keepProject,
  pageOf,
  renderNavigation,
  runFlowIn,
  spiesOnEveryCall,
  switchTo,
} from './history-navigation-test-support'
import { holdIndexReads } from './held-index-test-support'
import { unmountAndSettle } from './use-open-project-test-support'

const THIRD_ADDRESS = addressOf(THIRD_ID)

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('the history at the start', () => {
  it('replaces the bare address with the address of the latest project and adds no entry', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    const bar = createMemoryAddressBar()

    const { result } = renderNavigation(ports, bar)
    const handle = await editorOf(result)

    expect(handle.id).toBe(FIRST_ID)
    await waitFor(() => expect(bar.hash()).toBe(FIRST_ADDRESS))
    expect(bar.entries()).toEqual([FIRST_ADDRESS])
  })

  it('after a switch, a fresh mount on the same address opens that project', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    const bar = createMemoryAddressBar()
    const first = renderNavigation(ports, bar)
    await editorOf(first.result)
    await runFlowIn(first.result, switchTo(SECOND_ID))
    await waitFor(() => expect(bar.hash()).toBe(SECOND_ADDRESS))
    await unmountAndSettle(first.unmount)
    await usedLast(ports, FIRST_ID)

    const { result } = renderNavigation(reloadOf(ports), bar)

    expect((await editorOf(result)).id).toBe(SECOND_ID)
    expect(bar.hash()).toBe(SECOND_ADDRESS)
  })

  it('opens the latest project when the page is left with no project open', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    const bar = createMemoryAddressBar(PROJECTS_ADDRESS)
    const { result } = renderNavigation(ports, bar)
    await pageOf(result)

    act(() => result.current.leavePage())

    expect((await editorOf(result)).id).toBe(FIRST_ID)
    await waitFor(() => expect(bar.hash()).toBe(FIRST_ADDRESS))
    expect(bar.entries()).toEqual([PROJECTS_ADDRESS, FIRST_ADDRESS])
  })
})

describe('the address of a new project', () => {
  it('keeps the bare address for a new project until its first save', async () => {
    const bar = createMemoryAddressBar()
    const { result } = renderNavigation(createTestPorts({ durable: true }), bar)

    const handle = await editorOf(result)
    await settleForAWhile()

    expect(isStored(handle)).toBe(false)
    expect(bar.entries()).toEqual([''])
  })

  it('replaces the entry with the address of a new project at its first save', async () => {
    const bar = createMemoryAddressBar()
    const { result } = renderNavigation(createTestPorts({ durable: true }), bar)
    const handle = await editorOf(result)

    await editAndSave(handle)

    await waitFor(() => expect(bar.hash()).toBe(addressOf(handle.id)))
    expect(bar.entries()).toEqual([addressOf(handle.id)])
  })

  it('keeps the bare address for a project that the browser does not keep', async () => {
    const bar = createMemoryAddressBar()
    const { result } = renderNavigation(createTestPorts(), bar)
    const handle = await editorOf(result)

    await editAndSave(handle)
    await settleForAWhile()

    expect(handle.durable).toBe(false)
    expect(isStored(handle)).toBe(true)
    expect(bar.entries()).toEqual([''])
  })

  it('starts a new project from a notice and makes the address bare with one new entry', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    const bar = createMemoryAddressBar(MISSING_ADDRESS)
    const { result } = renderNavigation(ports, bar)
    await pageOf(result)

    act(() => result.current.startFresh())

    const handle = await editorOf(result)
    expect(handle.id).not.toBe(FIRST_ID)
    expect(handle.session.getProject().meta.name).toBe(NEW_PROJECT_NAME)
    await waitFor(() => expect(bar.entries()).toEqual([MISSING_ADDRESS, '']))
    expect(bar.position()).toBe(1)
    expect(lockedIds(ports)).toEqual([handle.id])
  })
})

describe('a double request for a new project', () => {
  it('starts one new project, takes one lock, and adds one entry when the page asks for it twice', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    const bar = createMemoryAddressBar(MISSING_ADDRESS)
    const { result, handles } = renderNavigation(ports, bar)
    await pageOf(result)
    const locks = vi.spyOn(ports.locks, 'tryAcquire')

    // Two presses in two renders: one `act` would batch both into one request for the owner.
    act(() => result.current.startFresh())
    await act(settle)
    act(() => result.current.startFresh())

    const handle = await editorOf(result)
    await act(settle)
    expect(handles).toEqual([handle])
    expect(locks).toHaveBeenCalledTimes(1)
    expect(lockedIds(ports)).toEqual([handle.id])
    expect(bar.entries()).toEqual([MISSING_ADDRESS, ''])
  })
})

describe('a retry while the index does not answer', () => {
  it('opens the project that the start could not open, without waiting for the index', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    vi.spyOn(ports.workspace, 'read').mockRejectedValueOnce(new Error('disk fault'))
    const bar = createMemoryAddressBar(FIRST_ADDRESS)
    const { result } = renderNavigation(ports, bar)
    expect((await pageOf(result)).notice?.id).toBe(FIRST_ID)
    const releaseReads = holdIndexReads(ports.index)

    act(() => result.current.retry())

    expect((await editorOf(result)).id).toBe(FIRST_ID)
    releaseReads()
  })
})

describe('the entries that the switches of the editor add', () => {
  it('adds one entry for each switch that a flow makes', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID, THIRD_ID)
    const bar = createMemoryAddressBar()
    const { result } = renderNavigation(ports, bar)
    await editorOf(result)
    await waitFor(() => expect(bar.hash()).toBe(FIRST_ADDRESS))

    await runFlowIn(result, switchTo(SECOND_ID))
    await waitFor(() => expect(bar.entries()).toEqual([FIRST_ADDRESS, SECOND_ADDRESS]))
    await runFlowIn(result, switchTo(THIRD_ID))

    await waitFor(() =>
      expect(bar.entries()).toEqual([FIRST_ADDRESS, SECOND_ADDRESS, THIRD_ADDRESS]),
    )
    expect(bar.position()).toBe(2)
  })

  it('adds no entry when a flow fails or keeps the project', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    const bar = createMemoryAddressBar()
    const { result } = renderNavigation(ports, bar)
    const handle = await editorOf(result)
    await waitFor(() => expect(bar.hash()).toBe(FIRST_ADDRESS))

    const failed = await runFlowIn(result, switchTo(MISSING_ID))
    const kept = await runFlowIn(result, keepProject(FIRST_ID))
    await act(settle)

    expect(failed).toEqual({ ok: false, failure: NOT_FOUND })
    expect(kept).toEqual({ ok: true, handle })
    expect(result.current.screen).toEqual({ kind: 'editor', handle })
    expect(bar.entries()).toEqual([FIRST_ADDRESS])
  })
})

describe('the page when the address names no project to open', () => {
  it('shows the page with the notice and keeps the address when the project of the address does not open', async () => {
    const ports = createTestPorts({ durable: true })
    const bar = createMemoryAddressBar(MISSING_ADDRESS)

    const { result } = renderNavigation(ports, bar)
    const page = await pageOf(result)

    expect(page.notice).toStrictEqual({ id: MISSING_ID, failure: NOT_FOUND })
    expect(result.current.handle).toBeNull()
    expect(bar.entries()).toEqual([MISSING_ADDRESS])
    expect(await storedIds(ports)).toEqual([])
  })

  it('shows the page with no notice for the projects address and opens nothing', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    const calls = [...spiesOnEveryCall(ports)]
    const bar = createMemoryAddressBar(PROJECTS_ADDRESS)

    const { result } = renderNavigation(ports, bar)
    const page = await pageOf(result)
    await act(settle)

    expect(page).toStrictEqual({ kind: 'projects' })
    expect(result.current.handle).toBeNull()
    for (const call of calls) expect(call).not.toHaveBeenCalled()
    expect(lockedIds(ports)).toEqual([])
    expect(bar.entries()).toEqual([PROJECTS_ADDRESS])
  })

  it('replaces an address that is not exact with the exact one', async () => {
    const bar = createMemoryAddressBar('#/project/a%2Fb')

    const { result } = renderNavigation(createTestPorts(), bar)
    await editorOf(result)

    await waitFor(() => expect(bar.hash()).toBe(''))
    expect(bar.entries()).toEqual([''])
  })
})
