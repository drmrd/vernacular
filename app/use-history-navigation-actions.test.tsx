import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlowResult, FolderRefusal } from '../session'
import {
  FIRST_ADDRESS,
  FIRST_ID,
  NOT_FOUND,
  PROJECTS_ADDRESS,
  SECOND_ID,
  THIRD_ID,
  atTheFirstProject,
  deletesTheOpenProject,
  editorOf,
  goBack,
  pageOf,
  runPageActionIn,
  startFlow,
  startPageAction,
  switchTo,
} from './history-navigation-test-support'
import { ACTION_RESULT, closesTheProject, keepsTheProject } from './owner-action-test-support'
import type { OwnerAction } from './use-open-project'
import { gatedFlow, resolvesWith } from './use-open-project-test-support'

const CANCELLED: FlowResult<FolderRefusal> = { ok: false, failure: { kind: 'cancelled' } }

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

/** The navigation on the Projects page, shown over the first project. */
async function onThePageOverTheFirstProject() {
  const start = await atTheFirstProject()
  act(() => start.result.current.showProjects())
  await pageOf(start.result)
  return start
}

/** The same, after a page action that closed the first project. */
async function onThePageAfterTheFirstProjectEnded() {
  const start = await onThePageOverTheFirstProject()
  await runPageActionIn(start.result, closesTheProject())
  return start
}

describe('an action that runs from the Projects page', () => {
  it('adds no history entry and keeps the page and the address', async () => {
    const { bar, result } = await onThePageOverTheFirstProject()

    const outcome = await runPageActionIn(result, keepsTheProject())

    expect(outcome).toEqual({ result: ACTION_RESULT, currentClosed: false })
    expect(result.current.screen).toStrictEqual({ kind: 'projects' })
    expect(bar.entries()).toEqual([FIRST_ADDRESS, PROJECTS_ADDRESS])
    expect(bar.position()).toBe(1)
    expect(bar.hash()).toBe(PROJECTS_ADDRESS)
  })

  it('keeps the link back to the open project when the action did not end it', async () => {
    const { bar, result, handle } = await onThePageOverTheFirstProject()
    await runPageActionIn(result, keepsTheProject())

    expect(result.current.handle).toBe(handle)
    await goBack(bar)

    expect(await editorOf(result)).toBe(handle)
  })

  it('keeps the page and shows no open project after the action ended the open project', async () => {
    const { bar, result } = await onThePageAfterTheFirstProjectEnded()

    expect(result.current.screen).toStrictEqual({ kind: 'projects' })
    expect(result.current.handle).toBeNull()
    expect(bar.entries()).toEqual([FIRST_ADDRESS, PROJECTS_ADDRESS])
  })

  it('opens the project of a card that is clicked after the action ended the open project', async () => {
    const { result } = await onThePageAfterTheFirstProjectEnded()

    const outcomes: Array<FlowResult | undefined> = []
    await act(async () => {
      outcomes.push(await result.current.runPageFlow(switchTo(SECOND_ID)))
    })

    expect(outcomes[0]).toMatchObject({ ok: true })
    expect((await editorOf(result)).id).toBe(SECOND_ID)
  })

  it('starts a new project at "New project" after the action ended the open project', async () => {
    const { result } = await onThePageAfterTheFirstProjectEnded()

    act(() => result.current.startFresh())

    const started = await editorOf(result)
    expect([FIRST_ID, SECOND_ID, THIRD_ID]).not.toContain(started.id)
  })

  it('shows the page with the not-stored notice at Back to the address of a deleted project', async () => {
    const { ports, bar, result } = await onThePageOverTheFirstProject()
    await runPageActionIn(result, deletesTheOpenProject())

    await goBack(bar)

    const page = await pageOf(result)
    expect(page.notice).toStrictEqual({ id: FIRST_ID, failure: NOT_FOUND })
    expect(result.current.handle).toBeNull()
    const stored = await ports.workspace.list()
    expect(stored.map((project) => project.id)).toEqual([SECOND_ID, THIRD_ID])
    await waitFor(() => expect(bar.hash()).toBe(FIRST_ADDRESS))
  })

  it('gives undefined and runs nothing while a flow runs', async () => {
    const { result } = await onThePageOverTheFirstProject()
    const running = gatedFlow<FolderRefusal>(resolvesWith(CANCELLED))
    const flowEnd = startFlow(result, running.flow)
    const action = vi.fn<OwnerAction<string>>(keepsTheProject())

    const settled = await startPageAction(result, action)
    running.letEnd()
    await act(() => flowEnd)

    expect(settled).toBeUndefined()
    expect(action).not.toHaveBeenCalled()
  })
})
