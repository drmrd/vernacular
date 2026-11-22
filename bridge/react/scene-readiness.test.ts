import { describe, it, expect } from 'vitest'
import {
  DRAWN_REVISION_ATTRIBUTE,
  LIVE_SCENE_CANVAS_TEST_ID,
  SCENE_READY_ATTRIBUTE,
  SCENE_REVISION_ATTRIBUTE,
  sceneReadinessProps,
  sceneRevisionProps,
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

  it('names the attributes that publish the scene revision and the drawn revision', () => {
    expect(SCENE_REVISION_ATTRIBUTE).toBe('data-scene-revision')
    expect(DRAWN_REVISION_ATTRIBUTE).toBe('data-drawn-revision')
  })

  it('publishes an empty drawn revision until a counted frame has drawn', () => {
    /* eslint-disable @typescript-eslint/naming-convention -- DOM data attribute names are kebab-case. */
    expect(sceneRevisionProps({ sceneRevision: 3, drawnRevision: null })).toEqual({
      'data-scene-revision': '3',
      'data-drawn-revision': '',
    })
    /* eslint-enable @typescript-eslint/naming-convention */
  })

  it('publishes both revisions once a frame has drawn an earlier scene', () => {
    /* eslint-disable @typescript-eslint/naming-convention -- DOM data attribute names are kebab-case. */
    expect(sceneRevisionProps({ sceneRevision: 3, drawnRevision: 2 })).toEqual({
      'data-scene-revision': '3',
      'data-drawn-revision': '2',
    })
    /* eslint-enable @typescript-eslint/naming-convention */
  })
})
