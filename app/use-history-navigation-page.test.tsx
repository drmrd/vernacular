import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlowResult } from '../session'
import {
  FIRST_ADDRESS,
  MISSING_ID,
  NOT_FOUND,
  PROJECTS_ADDRESS,
  SECOND_ADDRESS,
  SECOND_ID,
  atTheFirstProject,
  editorOf,
  goBack,
  pageOf,
  switchTo,
  type NavigationResult,
} from './history-navigation-test-support'
import type { Flow } from './use-open-project'

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

/** Starts a flow of the page inside `act`, and gives the promise of `runPageFlow`. */
function startPageFlow(
  result: NavigationResult,
  flow: Flow,
): Promise<FlowResult<never> | undefined> {
  let running!: Promise<FlowResult<never> | undefined>
  act(() => {
    running = result.current.runPageFlow(flow)
  })
  return running
}

/** Runs a flow of the page inside `act`, and gives what `runPageFlow` resolved with. */
async function runPageFlowIn(
  result: NavigationResult,
  flow: Flow,
): Promise<FlowResult<never> | undefined> {
  const outcomes: Array<FlowResult<never> | undefined> = []
  await act(async () => {
    outcomes.push(await result.current.runPageFlow(flow))
  })
  return outcomes[0]
}

describe('the page that shows over the open project', () => {
  it('shows the page, adds the projects address as a new entry, and keeps the open project', async () => {
    const { bar, result, handle } = await atTheFirstProject()

    act(() => result.current.showProjects())

    expect(await pageOf(result)).toStrictEqual({ kind: 'projects' })
    expect(result.current.handle).toBe(handle)
    expect(bar.entries()).toEqual([FIRST_ADDRESS, PROJECTS_ADDRESS])
    expect(bar.position()).toBe(1)
  })

  it('returns to the editor with the same project when the user goes back', async () => {
    const { bar, result, handle } = await atTheFirstProject()
    act(() => result.current.showProjects())
    await pageOf(result)

    await goBack(bar)

    expect(await editorOf(result)).toBe(handle)
    expect(bar.hash()).toBe(FIRST_ADDRESS)
    expect(bar.entries()).toEqual([FIRST_ADDRESS, PROJECTS_ADDRESS])
  })
})

describe('a flow that runs from the page', () => {
  it('hides the page and adds an entry when the flow gives a project', async () => {
    const { bar, result } = await atTheFirstProject()
    act(() => result.current.showProjects())
    await pageOf(result)

    const outcome = await runPageFlowIn(result, switchTo(SECOND_ID))

    expect(outcome).toMatchObject({ ok: true })
    expect((await editorOf(result)).id).toBe(SECOND_ID)
    await waitFor(() =>
      expect(bar.entries()).toEqual([FIRST_ADDRESS, PROJECTS_ADDRESS, SECOND_ADDRESS]),
    )
    expect(bar.position()).toBe(2)
  })

  it('keeps the page, the address, and the open project when the flow fails', async () => {
    const { bar, result, handle } = await atTheFirstProject()
    act(() => result.current.showProjects())
    await pageOf(result)

    const outcome = await runPageFlowIn(result, switchTo(MISSING_ID))

    expect(outcome).toEqual({ ok: false, failure: NOT_FOUND })
    expect(result.current.screen).toStrictEqual({ kind: 'projects' })
    expect(result.current.handle).toBe(handle)
    expect(bar.entries()).toEqual([FIRST_ADDRESS, PROJECTS_ADDRESS])
  })

  it('gives undefined and runs nothing when another flow is running', async () => {
    const { result } = await atTheFirstProject()
    act(() => result.current.showProjects())
    await pageOf(result)
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const running = startPageFlow(result, async (ports, current) => {
      await gate
      return switchTo(SECOND_ID)(ports, current)
    })
    const refused = vi.fn(switchTo(MISSING_ID))

    const outcome = await runPageFlowIn(result, refused)

    expect(outcome).toBeUndefined()
    expect(refused).not.toHaveBeenCalled()
    release()
    await act(async () => {
      await running
    })
  })
})
