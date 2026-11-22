import { describe, expect, it } from 'vitest'
import { frameMatchesCanvasSize, type FrameSizeState } from './drawn-frame-size'

interface FrameSizeOptions {
  buffer?: { width: number; height: number }
  size?: { width: number; height: number }
  pixelRatio?: number
  camera?: { aspect?: number }
}

const DEFAULT_SIZE = { width: 800, height: 600 }

function frameState(options: FrameSizeOptions = {}): FrameSizeState {
  const size = options.size ?? DEFAULT_SIZE
  const pixelRatio = options.pixelRatio ?? 1
  return {
    gl: {
      domElement: options.buffer ?? { width: size.width, height: size.height },
      getPixelRatio: () => pixelRatio,
    },
    size,
    camera: options.camera ?? { aspect: size.width / size.height },
  }
}

describe('frameMatchesCanvasSize', () => {
  it('accepts a frame whose buffer and camera aspect match the canvas size', () => {
    expect(frameMatchesCanvasSize(frameState())).toBe(true)
  })

  it('rejects a frame whose buffer is one pixel narrower than the canvas', () => {
    const state = frameState({ buffer: { width: 799, height: 600 } })

    expect(frameMatchesCanvasSize(state)).toBe(false)
  })

  it('rejects a frame whose buffer is one pixel shorter than the canvas', () => {
    const state = frameState({ buffer: { width: 800, height: 599 } })

    expect(frameMatchesCanvasSize(state)).toBe(false)
  })

  it('scales the expected buffer by the pixel ratio', () => {
    const state = frameState({ buffer: { width: 1600, height: 1200 }, pixelRatio: 2 })

    expect(frameMatchesCanvasSize(state)).toBe(true)
  })

  it('floors a fractional canvas size when it works out the expected buffer', () => {
    const size = { width: 523.5, height: 300 }
    const state = frameState({ size, buffer: { width: 523, height: 300 } })

    expect(frameMatchesCanvasSize(state)).toBe(true)
  })

  it('rejects a frame whose camera aspect is still the previous size aspect', () => {
    const state = frameState({ camera: { aspect: 400 / 600 } })

    expect(frameMatchesCanvasSize(state)).toBe(false)
  })

  it('lets the buffer alone decide for a camera without an aspect', () => {
    const state = frameState({ camera: {} })

    expect(frameMatchesCanvasSize(state)).toBe(true)
  })

  it('rejects a canvas with zero width', () => {
    const size = { width: 0, height: 600 }
    const state = frameState({ size, buffer: { width: 0, height: 600 }, camera: {} })

    expect(frameMatchesCanvasSize(state)).toBe(false)
  })

  it('rejects a canvas with zero height', () => {
    const size = { width: 800, height: 0 }
    const state = frameState({ size, buffer: { width: 800, height: 0 }, camera: {} })

    expect(frameMatchesCanvasSize(state)).toBe(false)
  })
})
