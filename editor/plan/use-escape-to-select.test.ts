import { afterEach, describe, it, expect, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import type { ToolId } from '../tools/active-tool-context'
import { claimKeystroke } from './keyboard-guard'
import { useEscapeToSelect } from './use-escape-to-select'

afterEach(cleanup)

// The end of the key press task: a task queued during the press runs only after
// every listener of that press has run.
function endOfKeyPressTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve))
}

// Escape is settled once every listener on the keystroke has had its say, so the
// press is flushed, and the task that ends it has passed, before the tool is read.
async function pressEscape(target: EventTarget = window): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await endOfKeyPressTask()
  })
}

// Stands in for a tool that cancels an in-progress run on Escape. It subscribes
// after the hook under test, the way the plan's authoring keyboard does, so the
// ladder cannot depend on which listener happens to run first.
function withRunCancelled(body: () => Promise<void>): Promise<void> {
  const claim = (event: KeyboardEvent): void => claimKeystroke(event)
  window.addEventListener('keydown', claim)
  return body().finally(() => window.removeEventListener('keydown', claim))
}

describe('useEscapeToSelect', () => {
  it('returns a placement tool to select on Escape, and leaves the select tool alone', async () => {
    const placementTools: ToolId[] = [
      'draw-wall',
      'place-opening',
      'place-furniture',
      'place-stair',
      'dimension',
      'calibrate',
    ]

    for (const tool of placementTools) {
      const setTool = vi.fn()
      const { unmount } = renderHook(() => useEscapeToSelect({ tool, setTool }))

      await pressEscape()

      expect(setTool).toHaveBeenCalledWith('select')
      unmount()
    }

    const setTool = vi.fn()
    renderHook(() => useEscapeToSelect({ tool: 'select', setTool }))

    await pressEscape()

    expect(setTool).not.toHaveBeenCalled()
  })

  it('keeps the tool armed when the same Escape cancelled a run', async () => {
    const setTool = vi.fn()
    renderHook(() => useEscapeToSelect({ tool: 'draw-wall', setTool }))

    await withRunCancelled(async () => {
      await pressEscape()
    })

    expect(setTool).not.toHaveBeenCalled()
  })

  // A browser runs a microtask checkpoint between the listeners of a real key
  // press, so `await Promise.resolve()` stands for the gap between the hook's
  // listener and a later listener that claims the key. The timer stands for the
  // end of the key press task, the first moment after every listener has run.
  it('keeps the tool armed when a tool claims the Escape after a microtask checkpoint, before the key press task ends', async () => {
    const setTool = vi.fn()
    renderHook(() => useEscapeToSelect({ tool: 'draw-wall', setTool }))
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })

    await act(async () => {
      window.dispatchEvent(event)
      await Promise.resolve()
      claimKeystroke(event)
      await endOfKeyPressTask()
    })

    expect(setTool).not.toHaveBeenCalled()
  })

  // The Escape was pressed for the old tool, so a later tool must not be sent to select by it.
  // The rerender stays outside any act of its own so that the tool change commits, as it does
  // in the application, before the key press task ends.
  it('drops a pending return to select when the tool changes before it is decided', async () => {
    const setTool = vi.fn()
    const { rerender } = renderHook(
      ({ tool }: { tool: ToolId }) => useEscapeToSelect({ tool, setTool }),
      { initialProps: { tool: 'draw-wall' } },
    )

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    await Promise.resolve()
    rerender({ tool: 'dimension' })
    await endOfKeyPressTask()

    expect(setTool).not.toHaveBeenCalled()
  })

  // The hook is gone by the time the decision falls due, so the old press must not move the tool.
  it('drops a pending return to select when the hook unmounts before it is decided', async () => {
    const setTool = vi.fn()
    const { unmount } = renderHook(() => useEscapeToSelect({ tool: 'draw-wall', setTool }))

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    await Promise.resolve()
    unmount()
    await endOfKeyPressTask()

    expect(setTool).not.toHaveBeenCalled()
  })

  it('returns to select on the next Escape, once no run is left to cancel', async () => {
    const setTool = vi.fn()
    renderHook(() => useEscapeToSelect({ tool: 'draw-wall', setTool }))

    await withRunCancelled(async () => {
      await pressEscape()
    })
    await pressEscape()

    expect(setTool).toHaveBeenCalledExactlyOnceWith('select')
  })

  it('still returns to select when the tool chip that armed the tool holds focus', async () => {
    const setTool = vi.fn()
    renderHook(() => useEscapeToSelect({ tool: 'draw-wall', setTool }))

    const chip = document.createElement('button')
    document.body.appendChild(chip)
    chip.focus()
    await pressEscape(chip)
    chip.remove()

    expect(setTool).toHaveBeenCalledWith('select')
  })

  it('ignores Escape while a form control is focused', async () => {
    const setTool = vi.fn()
    renderHook(() => useEscapeToSelect({ tool: 'draw-wall', setTool }))

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    await pressEscape(input)
    input.remove()

    expect(setTool).not.toHaveBeenCalled()
  })
})
