import { describe, it, expect } from 'vitest'
import {
  LIVE_SCENE_CANVAS_TEST_ID,
  SCENE_READY_ATTRIBUTE,
  sceneReadinessProps,
} from './scene-readiness'

describe('scene readiness contract', () => {
  it('names the live canvas test id and readiness attribute shared by producer and consumer', () => {
    expect(LIVE_SCENE_CANVAS_TEST_ID).toBe('live-scene-canvas')
    expect(SCENE_READY_ATTRIBUTE).toBe('data-harness-ready')
  })

  it('advertises the canvas as ready once the scene has rendered', () => {
    /* eslint-disable @typescript-eslint/naming-convention -- DOM data attribute names are kebab-case. */
    expect(sceneReadinessProps(true)).toEqual({
      'data-testid': 'live-scene-canvas',
      'data-harness-ready': 'true',
    })
    /* eslint-enable @typescript-eslint/naming-convention */
  })

  it('advertises the canvas as not ready before the scene has rendered', () => {
    /* eslint-disable @typescript-eslint/naming-convention -- DOM data attribute names are kebab-case. */
    expect(sceneReadinessProps(false)).toEqual({
      'data-testid': 'live-scene-canvas',
      'data-harness-ready': 'false',
    })
    /* eslint-enable @typescript-eslint/naming-convention */
  })
})
