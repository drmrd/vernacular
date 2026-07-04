import { describe, expect, it, vi } from 'vitest'
import type { AmbientOcclusionPipeline, FrameRenderer } from './render-scene-frame'
import { renderSceneFrame } from './render-scene-frame'

function makeRenderer(): FrameRenderer {
  return { render: vi.fn() }
}

function makePipeline(): AmbientOcclusionPipeline {
  return { render: vi.fn(), setSize: vi.fn(), dispose: vi.fn() }
}

describe('renderSceneFrame', () => {
  it('draws through the ambient-occlusion pipeline when one is supplied', () => {
    const renderer = makeRenderer()
    const pipeline = makePipeline()
    const scene = {}
    const camera = {}

    renderSceneFrame(renderer, scene, camera, pipeline)

    expect(pipeline.render).toHaveBeenCalledTimes(1)
    expect(renderer.render).not.toHaveBeenCalled()
  })

  it('falls back to the renderer directly when no pipeline is supplied', () => {
    const renderer = makeRenderer()
    const scene = {}
    const camera = {}

    renderSceneFrame(renderer, scene, camera, null)

    expect(renderer.render).toHaveBeenCalledTimes(1)
    expect(renderer.render).toHaveBeenCalledWith(scene, camera)
  })
})
