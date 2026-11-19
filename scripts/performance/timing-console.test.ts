import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { classifyPageMessages } from './timing-console.mjs'

// In the real page a failure can show only as a console message: the ambient-occlusion pipeline
// of the realistic lighting that fails to build is logged once, and the product goes on without
// the effect, so the timed "realistic" frames would be too fast under a name that says otherwise.
// classifyPageMessages says what the messages of the page mean for the times.

const AMBIENT_OCCLUSION_TEXT =
  'Failed to build the ambient-occlusion render pipeline; realistic lighting continues without it'
const RENDERER_TEXT = 'Scene renderer failed to'
const FURNITURE_TEXT = 'Failed to load furniture model'
const DEVICE_LOST_TEXT = 'Device Lost'
const CLOCK_TEXT = 'THREE.Clock: This module has been deprecated'

const AMBIENT_OCCLUSION_MESSAGE = { type: 'warning', text: AMBIENT_OCCLUSION_TEXT }
const RENDERER_MESSAGE = { type: 'warning', text: `${RENDERER_TEXT} render a frame` }
const DEVICE_LOST_MESSAGE = {
  type: 'error',
  text: `THREE.WebGPURenderer: WebGPU ${DEVICE_LOST_TEXT}:\n\nMessage: the device was reset`,
}
const FURNITURE_MESSAGE = {
  type: 'warning',
  text: `${FURNITURE_TEXT} 0123abcd Error: not in any catalog`,
}
const CLOCK_MESSAGE = { type: 'warning', text: `${CLOCK_TEXT}. Please use THREE.Timer instead.` }

describe('the classification of the console messages of the page', () => {
  it('gives no refusal, no unexpected message, and a known count of 0 for no messages', () => {
    expect(classifyPageMessages([])).toEqual({ refusals: [], unexpected: [], knownCount: 0 })
  })

  it('ignores a message that is neither a warning, an error, nor a page error', () => {
    const messages = [
      { type: 'log', text: 'a log line' },
      { type: 'info', text: 'an info line' },
      { type: 'log', text: AMBIENT_OCCLUSION_TEXT },
    ]

    expect(classifyPageMessages(messages)).toEqual({
      refusals: [],
      unexpected: [],
      knownCount: 0,
    })
  })
})

describe('the refusals of the console check', () => {
  it('give one refusal for a failed ambient-occlusion pipeline, naming the effect and the discarded times', () => {
    const { refusals, unexpected } = classifyPageMessages([AMBIENT_OCCLUSION_MESSAGE])

    expect(refusals).toHaveLength(1)
    expect(refusals[0]).toContain('ambient-occlusion')
    expect(refusals[0]).toContain('realistic')
    expect(refusals[0]?.toLowerCase()).toContain('discarded')
    expect(refusals[0]?.endsWith('.')).toBe(true)
    expect(unexpected).toEqual([])
  })

  it('give one refusal for a scene renderer that failed, saying that the times were discarded', () => {
    const { refusals, unexpected } = classifyPageMessages([RENDERER_MESSAGE])

    expect(refusals).toHaveLength(1)
    expect(refusals[0]?.toLowerCase()).toContain('discarded')
    expect(refusals[0]?.endsWith('.')).toBe(true)
    expect(unexpected).toEqual([])
  })

  it('give one refusal for a lost GPU device, saying that the device was lost and the times were discarded', () => {
    const { refusals, unexpected } = classifyPageMessages([DEVICE_LOST_MESSAGE])

    expect(refusals).toHaveLength(1)
    expect(refusals[0]).toContain('device was lost')
    expect(refusals[0]?.toLowerCase()).toContain('discarded')
    expect(refusals[0]?.endsWith('.')).toBe(true)
    expect(unexpected).toEqual([])
  })

  it('give a refusal for a page error that holds the text too, and not only for a warning', () => {
    const { refusals } = classifyPageMessages([
      { type: 'pageerror', text: DEVICE_LOST_MESSAGE.text },
    ])

    expect(refusals).toHaveLength(1)
  })

  it('give one refusal for each kind of failure, three for the three kinds', () => {
    const { refusals } = classifyPageMessages([
      AMBIENT_OCCLUSION_MESSAGE,
      RENDERER_MESSAGE,
      DEVICE_LOST_MESSAGE,
    ])

    expect(refusals).toHaveLength(3)
    expect(new Set(refusals).size).toBe(3)
  })

  it('give one refusal for a kind, also when its message repeats', () => {
    const { refusals } = classifyPageMessages([
      AMBIENT_OCCLUSION_MESSAGE,
      DEVICE_LOST_MESSAGE,
      AMBIENT_OCCLUSION_MESSAGE,
      DEVICE_LOST_MESSAGE,
      AMBIENT_OCCLUSION_MESSAGE,
    ])

    expect(refusals).toHaveLength(2)
  })
})

describe('the known messages of the console check', () => {
  it('count a failed furniture model load and the notice of the deprecated clock, and do not list them', () => {
    const result = classifyPageMessages([FURNITURE_MESSAGE, CLOCK_MESSAGE, FURNITURE_MESSAGE])

    expect(result).toEqual({ refusals: [], unexpected: [], knownCount: 3 })
  })
})

describe('the unexpected messages of the console check', () => {
  it('hold every other warning, error, and page error, in order and unchanged', () => {
    const first = { type: 'error', text: 'Uncaught TypeError: x is not a function' }
    const second = { type: 'warning', text: 'A warning that nobody knows' }
    const third = { type: 'pageerror', text: 'ReferenceError: y is not defined' }

    const result = classifyPageMessages([
      first,
      FURNITURE_MESSAGE,
      second,
      { type: 'log', text: 'ignored' },
      AMBIENT_OCCLUSION_MESSAGE,
      third,
      CLOCK_MESSAGE,
    ])

    expect(result.unexpected).toEqual([first, second, third])
    expect(result.knownCount).toBe(2)
    expect(result.refusals).toHaveLength(1)
  })
})

describe('the texts that the console check looks for', () => {
  // A reworded product message must fail here and not switch the check off without a sound.
  it.each([
    [
      'the ambient-occlusion failure',
      'bridge/react/use-ambient-occlusion.ts',
      AMBIENT_OCCLUSION_TEXT,
    ],
    ['the scene renderer failure', 'bridge/react/scene-renderer-canvas.tsx', RENDERER_TEXT],
    ['the furniture model failure', 'bridge/react/furniture-model-cache.ts', FURNITURE_TEXT],
    [
      'the lost device of the 3D library',
      'node_modules/three/src/renderers/common/Renderer.js',
      DEVICE_LOST_TEXT,
    ],
  ])('still occur in the source that logs %s', (_name, path, text) => {
    expect(readFileSync(resolve(path), 'utf8')).toContain(text)
  })
})
