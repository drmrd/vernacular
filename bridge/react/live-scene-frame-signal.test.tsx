import { act, cleanup, render, renderHook } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FrameSizeState } from './drawn-frame-size'
import { LiveSceneFrameSignal, useDrawnRevision } from './live-scene-frame-signal'

type FrameCallback = (state: FrameSizeState, delta: number) => void

// The 3D library's frame hook is the collaborator of the signal. Subscribers are kept while
// mounted, and `drawFrame` calls them with a frame state the way a drawn frame does.
const frameLoop = vi.hoisted(() => {
  const subscribers = new Set<{ current: (state: never, delta: number) => void }>()
  return { subscribers }
})

vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: FrameCallback) => {
    useEffect(() => {
      const subscriber = { current: callback }
      frameLoop.subscribers.add(subscriber)
      return () => {
        frameLoop.subscribers.delete(subscriber)
      }
    })
  },
}))

const CANVAS_SIZE = { width: 800, height: 600 }

function countedFrame(): FrameSizeState {
  return {
    gl: { domElement: { ...CANVAS_SIZE }, getPixelRatio: () => 1 },
    size: CANVAS_SIZE,
    camera: { aspect: CANVAS_SIZE.width / CANVAS_SIZE.height },
  }
}

function frameWithNarrowBuffer(): FrameSizeState {
  return {
    ...countedFrame(),
    gl: { domElement: { width: 799, height: 600 }, getPixelRatio: () => 1 },
  }
}

function frameWithStaleAspect(): FrameSizeState {
  return { ...countedFrame(), camera: { aspect: 1 } }
}

function drawFrame(state: FrameSizeState) {
  act(() => {
    for (const subscriber of frameLoop.subscribers) {
      subscriber.current(state as never, 0)
    }
  })
}

function renderSignal() {
  const onDrawnRevision = vi.fn()
  const onDrawnFrame = vi.fn()
  const view = render(
    <LiveSceneFrameSignal
      revision={1}
      onDrawnRevision={onDrawnRevision}
      onDrawnFrame={onDrawnFrame}
    />,
  )
  const showRevision = (revision: number) => {
    view.rerender(
      <LiveSceneFrameSignal
        revision={revision}
        onDrawnRevision={onDrawnRevision}
        onDrawnFrame={onDrawnFrame}
      />,
    )
  }
  return { onDrawnRevision, onDrawnFrame, showRevision }
}

describe('LiveSceneFrameSignal', () => {
  afterEach(() => {
    cleanup()
    frameLoop.subscribers.clear()
  })

  it('reports the drawn revision and the drawn frame once after a counted frame', () => {
    const { onDrawnRevision, onDrawnFrame } = renderSignal()

    drawFrame(countedFrame())

    expect(onDrawnRevision).toHaveBeenCalledTimes(1)
    expect(onDrawnRevision).toHaveBeenCalledWith(1)
    expect(onDrawnFrame).toHaveBeenCalledTimes(1)
  })

  it('reports nothing for a frame whose buffer does not match the canvas size', () => {
    const { onDrawnRevision, onDrawnFrame } = renderSignal()

    drawFrame(frameWithNarrowBuffer())

    expect(onDrawnRevision).not.toHaveBeenCalled()
    expect(onDrawnFrame).not.toHaveBeenCalled()
  })

  it('reports nothing for a frame whose camera aspect is stale', () => {
    const { onDrawnRevision, onDrawnFrame } = renderSignal()

    drawFrame(frameWithStaleAspect())

    expect(onDrawnRevision).not.toHaveBeenCalled()
    expect(onDrawnFrame).not.toHaveBeenCalled()
  })

  it('reports a revision once but every counted frame at that revision', () => {
    const { onDrawnRevision, onDrawnFrame } = renderSignal()

    drawFrame(countedFrame())
    drawFrame(countedFrame())
    drawFrame(countedFrame())

    expect(onDrawnRevision).toHaveBeenCalledTimes(1)
    expect(onDrawnFrame).toHaveBeenCalledTimes(3)
  })

  it('reports a new revision only on the first counted frame after it arrives', () => {
    const { onDrawnRevision, showRevision } = renderSignal()
    drawFrame(countedFrame())

    showRevision(2)
    drawFrame(frameWithNarrowBuffer())

    expect(onDrawnRevision).not.toHaveBeenCalledWith(2)

    drawFrame(countedFrame())

    expect(onDrawnRevision).toHaveBeenLastCalledWith(2)
    expect(onDrawnRevision).toHaveBeenCalledTimes(2)
  })
})

describe('useDrawnRevision', () => {
  it('starts without a drawn revision and holds the revision that was noted', () => {
    const { result } = renderHook(() => useDrawnRevision())

    expect(result.current.drawnRevision).toBeNull()

    act(() => {
      result.current.noteDrawnRevision(4)
    })

    expect(result.current.drawnRevision).toBe(4)
  })
})
