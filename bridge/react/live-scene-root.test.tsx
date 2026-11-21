import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act, createRoot } from '@react-three/fiber'

import type { SceneGraph } from '../../core'
import type { FramedScene } from './framed-scene'
import { createFramedSceneReconciler } from './framed-scene-reconciler'
import { LiveSceneRoot } from './live-scene-root'

// These tests run on the 3D library's own React root (not mocked), the root the live view
// commits its scene into. The renderer is a stand-in object, the frame loop never runs, and the
// size is fixed, so no canvas context is needed. The recorded log reads which scene was reported
// as attached, which scene roots had a parent (were drawn) at that moment, and which were released.

const SIZE = { width: 800, height: 600, top: 0, left: 0 }

const EMPTY_GRAPH: SceneGraph = {
  nodes: [],
  walls: [],
  rooms: [],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
  furniture: [],
}

// The slice of a renderer the library touches while it configures a root and never draws.
const standInRenderer = {
  xr: {
    enabled: false,
    isPresenting: false,
    addEventListener() {},
    removeEventListener() {},
    setAnimationLoop() {},
  },
  shadowMap: { enabled: false, type: 0 },
  setPixelRatio() {},
  setSize() {},
  render() {},
}

function emptyScene(): FramedScene {
  return createFramedSceneReconciler().reconcile(EMPTY_GRAPH, {})
}

function recorderFor(scenes: Record<string, FramedScene>) {
  const log: string[] = []
  const nameOf = (scene: FramedScene): string =>
    Object.keys(scenes).find((name) => scenes[name] === scene) ?? 'unknown'
  const drawn = (): string =>
    Object.keys(scenes)
      .filter((name) => scenes[name]?.root.parent !== null)
      .join('+') || 'none'
  const onAttached = (scene: FramedScene): (() => void) => {
    log.push(`attached ${nameOf(scene)} while drawing ${drawn()}`)
    return () => log.push(`released ${nameOf(scene)}`)
  }
  return { log, onAttached }
}

// The library's act() only batches work when React is told the test environment is acting.
function setActEnvironment(acting: boolean): void {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = acting
}

async function openLibraryRoot() {
  const root = createRoot(document.createElement('canvas'))
  await root.configure({ gl: standInRenderer as never, frameloop: 'never', size: SIZE })
  return root
}

describe('LiveSceneRoot on the 3D library root', () => {
  beforeEach(() => setActEnvironment(true))
  afterEach(() => setActEnvironment(false))

  it('reports the scene as attached while its root has a parent', async () => {
    const first = emptyScene()
    const { log, onAttached } = recorderFor({ first })
    const root = await openLibraryRoot()

    await act(async () => root.render(<LiveSceneRoot framed={first} onAttached={onAttached} />))

    expect(log).toEqual(['attached first while drawing first'])
    await act(async () => root.unmount())
  })

  it('releases the first scene, then reports the second while only the second root has a parent', async () => {
    const first = emptyScene()
    const second = emptyScene()
    const { log, onAttached } = recorderFor({ first, second })
    const root = await openLibraryRoot()
    await act(async () => root.render(<LiveSceneRoot framed={first} onAttached={onAttached} />))

    await act(async () => root.render(<LiveSceneRoot framed={second} onAttached={onAttached} />))

    expect(log).toEqual([
      'attached first while drawing first',
      'released first',
      'attached second while drawing second',
    ])
    await act(async () => root.unmount())
  })

  it('releases the attached scene when the root unmounts', async () => {
    const first = emptyScene()
    const { log, onAttached } = recorderFor({ first })
    const root = await openLibraryRoot()
    await act(async () => root.render(<LiveSceneRoot framed={first} onAttached={onAttached} />))

    await act(async () => root.unmount())

    expect(log).toEqual(['attached first while drawing first', 'released first'])
  })
})
