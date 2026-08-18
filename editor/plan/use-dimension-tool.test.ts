import { afterEach, describe, it, expect, vi } from 'vitest'
import { act, renderHook, cleanup } from '@testing-library/react'
import { ADD_DIMENSION, type AddDimensionParams, type Command, type Point } from '../../core'
import type { EditorSession } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import { wasKeystrokeClaimed } from './keyboard-guard'
import { useDimensionTool, type DimensionTool } from './use-dimension-tool'
import type { Viewport } from './viewport'

afterEach(cleanup)

const VIEWPORT: Viewport = { scale: 1, offset: { x: 0, y: 0 } }
const FLOOR_ID = 'ground'

// Three distinct click positions in canvas pixels. At scale 1 with no offset a
// click maps to world { x, -y }, which `world` below mirrors.
const ABANDONED = { x: 100, y: 200 }
const FRESH_START = { x: 300, y: 400 }
const FRESH_END = { x: 700, y: 900 }

function world(click: { x: number; y: number }): Point {
  return { x: click.x, y: -click.y }
}

function sessionWithFloor(dispatch: ReturnType<typeof vi.fn>): EditorSession {
  return {
    dispatch,
    getProject: () => ({ floors: [{ id: FLOOR_ID }] }),
    undo: vi.fn(),
  } as unknown as EditorSession
}

// jsdom reports a zero-sized canvas, which would divide eventToCanvas by zero;
// pin the rect to the canvas's own pixel size so a click maps one-to-one.
function canvasAtOrigin(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: canvas.width, height: canvas.height }) as DOMRect
  return canvas
}

function clickAt(click: { x: number; y: number }) {
  return {
    clientX: click.x,
    clientY: click.y,
    currentTarget: canvasAtOrigin(),
  } as unknown as Parameters<DimensionTool['onPointerDown']>[0]
}

// Escape is settled once every listener on the keystroke has had its say, so the
// press is flushed before the claim is read.
async function pressEscape(): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  await act(async () => {
    window.dispatchEvent(event)
  })
  return event
}

function mountDimensionTool(initialTool: ToolId = 'dimension') {
  const dispatch = vi.fn()
  const session = sessionWithFloor(dispatch)
  const view = renderHook(
    ({ tool }: { tool: ToolId }) =>
      useDimensionTool({ session, tool, viewport: VIEWPORT, activeFloorId: FLOOR_ID }),
    { initialProps: { tool: initialTool } },
  )
  const click = (at: { x: number; y: number }): void => {
    act(() => {
      view.result.current.onPointerDown(clickAt(at))
    })
  }
  return { dispatch, view, click }
}

function measurementOf(dispatch: ReturnType<typeof vi.fn>): AddDimensionParams['dimension'] {
  const command = dispatch.mock.calls[0]?.[0] as Command<AddDimensionParams>
  expect(command.type).toBe(ADD_DIMENSION)
  return command.params.dimension
}

describe('useDimensionTool cancels a pointer measurement on Escape', () => {
  it('drops the pending start point and claims the keystroke, so the tool stays armed', async () => {
    const { dispatch, click } = mountDimensionTool()
    click(ABANDONED)

    const event = await pressEscape()

    expect(wasKeystrokeClaimed(event)).toBe(true)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('starts a fresh measurement from the next click rather than pairing the stale start', async () => {
    const { dispatch, click } = mountDimensionTool()
    click(ABANDONED)
    await pressEscape()

    click(FRESH_START)
    click(FRESH_END)

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(measurementOf(dispatch)).toMatchObject({
      start: world(FRESH_START),
      end: world(FRESH_END),
    })
  })

  it('clears the rubber-band preview the abandoned start was anchoring', async () => {
    const { view, click } = mountDimensionTool()
    click(ABANDONED)
    act(() => {
      view.result.current.onPointerMove(clickAt(FRESH_END))
    })
    expect(view.result.current.preview).toBeDefined()

    await pressEscape()

    expect(view.result.current.preview).toBeUndefined()
  })

  it('leaves Escape unclaimed when no measurement is half taken, so the ladder moves on', async () => {
    mountDimensionTool()

    const event = await pressEscape()

    expect(wasKeystrokeClaimed(event)).toBe(false)
  })
})
