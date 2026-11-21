import { act, cleanup, render } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RendererMemoryProbe } from './renderer-memory-probe'

type FrameCallback = (state: unknown, delta: number) => void

// The 3D library's hooks are the collaborators of the probe. The renderer stand-in carries a
// real canvas element and the memory counts the test changes between frames. `useFrame`
// subscribers are kept while mounted, and `drawFrame` calls them the way a drawn frame does.
const canvasFixture = vi.hoisted(() => {
  const subscribers = new Set<{ current: (state: unknown, delta: number) => void }>()
  const gl = {
    domElement: undefined as unknown as HTMLCanvasElement,
    info: { memory: { geometries: 0, textures: 0 } },
  }
  return { subscribers, gl, state: { gl } }
})

vi.mock('@react-three/fiber', () => ({
  useThree: (select?: (state: typeof canvasFixture.state) => unknown) =>
    select ? select(canvasFixture.state) : canvasFixture.state,
  useFrame: (callback: FrameCallback) => {
    useEffect(() => {
      const subscriber = { current: callback }
      canvasFixture.subscribers.add(subscriber)
      return () => {
        canvasFixture.subscribers.delete(subscriber)
      }
    })
  },
}))

function drawFrame() {
  act(() => {
    for (const subscriber of canvasFixture.subscribers) {
      subscriber.current(canvasFixture.state, 0)
    }
  })
}

function setRendererCounts(geometries: number, textures: number) {
  canvasFixture.gl.info.memory.geometries = geometries
  canvasFixture.gl.info.memory.textures = textures
}

function visitWithSearch(search: string) {
  window.history.replaceState(null, '', `${window.location.pathname}${search}`)
}

describe('RendererMemoryProbe', () => {
  let canvas: HTMLCanvasElement

  beforeEach(() => {
    canvas = document.createElement('canvas')
    canvasFixture.gl.domElement = canvas
    setRendererCounts(0, 0)
  })

  afterEach(() => {
    cleanup()
    canvasFixture.subscribers.clear()
    visitWithSearch('')
  })

  it('writes the renderer geometry and texture counts onto its canvas after each drawn frame when the e2e flag is set', () => {
    visitWithSearch('?e2e')
    setRendererCounts(7, 2)
    render(<RendererMemoryProbe />)

    drawFrame()

    expect(canvas.getAttribute('data-renderer-geometries')).toBe('7')
    expect(canvas.getAttribute('data-renderer-textures')).toBe('2')

    setRendererCounts(5, 3)
    drawFrame()

    expect(canvas.getAttribute('data-renderer-geometries')).toBe('5')
    expect(canvas.getAttribute('data-renderer-textures')).toBe('3')
  })

  it('writes no renderer count attributes onto its canvas without the e2e flag', () => {
    visitWithSearch('')
    setRendererCounts(7, 2)
    render(<RendererMemoryProbe />)

    drawFrame()

    expect(canvas.hasAttribute('data-renderer-geometries')).toBe(false)
    expect(canvas.hasAttribute('data-renderer-textures')).toBe(false)
  })
})
