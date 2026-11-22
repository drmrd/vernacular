import { act, cleanup, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FrameSizeState } from './drawn-frame-size'
import { LiveSceneFrameSignal, useDrawnRevision } from './live-scene-frame-signal'
import { SceneReadinessBoundary } from './scene-readiness-boundary'

type FrameCallback = (state: FrameSizeState, delta: number) => void

// The 3D library's frame hook is the one collaborator mocked: subscribers are kept while
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

function drawFrame(state: FrameSizeState) {
  act(() => {
    for (const subscriber of frameLoop.subscribers) {
      subscriber.current(state as never, 0)
    }
  })
}

function noop() {
  // The live-view readiness fact is not under test here.
}

// The live canvas in miniature: the boundary publishes what the signal reports.
function LiveCanvasStandIn({ revision }: { revision: number }) {
  const { drawnRevision, noteDrawnRevision } = useDrawnRevision()
  return (
    <SceneReadinessBoundary sceneRevision={revision} drawnRevision={drawnRevision}>
      <LiveSceneFrameSignal
        revision={revision}
        onDrawnRevision={noteDrawnRevision}
        onDrawnFrame={noop}
      />
    </SceneReadinessBoundary>
  )
}

function publishedAttributes() {
  const canvas = screen.getByTestId('live-scene-canvas')
  return {
    ready: canvas.getAttribute('data-harness-ready'),
    scene: canvas.getAttribute('data-scene-revision'),
    drawn: canvas.getAttribute('data-drawn-revision'),
  }
}

afterEach(() => {
  cleanup()
  frameLoop.subscribers.clear()
})

describe('SceneReadinessBoundary', () => {
  it('publishes the scene revision and no drawn revision before a counted frame', () => {
    render(
      <SceneReadinessBoundary sceneRevision={1} drawnRevision={null}>
        <span />
      </SceneReadinessBoundary>,
    )

    expect(publishedAttributes()).toEqual({ ready: 'false', scene: '1', drawn: '' })
  })

  it('publishes ready and the drawn revision once a counted frame has drawn', () => {
    render(
      <SceneReadinessBoundary sceneRevision={1} drawnRevision={1}>
        <span />
      </SceneReadinessBoundary>,
    )

    expect(publishedAttributes()).toEqual({ ready: 'true', scene: '1', drawn: '1' })
  })

  it('advances the drawn revision only on a counted frame that drew the new scene', () => {
    const view = render(<LiveCanvasStandIn revision={1} />)
    drawFrame(countedFrame())

    expect(publishedAttributes()).toEqual({ ready: 'true', scene: '1', drawn: '1' })

    view.rerender(<LiveCanvasStandIn revision={2} />)
    drawFrame(frameWithNarrowBuffer())

    expect(publishedAttributes()).toEqual({ ready: 'true', scene: '2', drawn: '1' })

    drawFrame(countedFrame())

    expect(publishedAttributes()).toEqual({ ready: 'true', scene: '2', drawn: '2' })
  })
})
