import { act, cleanup, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSceneSessionStore } from '../scene-session/scene-session-store'
import { AmbientOcclusionRenderTakeover } from './ambient-occlusion-render-takeover'
import { SceneSessionProvider } from './scene-session-provider'
import { useLiveViewReadiness, type LiveViewReadinessNotes } from './use-live-view-readiness'

interface FakePipeline {
  dispose: ReturnType<typeof vi.fn>
  setSize: ReturnType<typeof vi.fn>
}

interface PendingBuild {
  resolve: (pipeline: FakePipeline) => void
  pipeline: FakePipeline
}

// The 3D library's hooks and the engine's pipeline builder are the collaborators of the
// takeover. A pending-promise builder lets each test decide when a build settles, so the
// test reads the live-view readiness the takeover reports without a GPU.
const collaborators = vi.hoisted(() => ({
  threeState: {
    scene: {},
    camera: {},
    gl: {},
    size: { width: 800, height: 600 },
  } as Record<string, unknown>,
  builds: [] as PendingBuild[],
}))

vi.mock('@react-three/fiber', () => ({
  useThree: (select: (state: Record<string, unknown>) => unknown) =>
    select(collaborators.threeState),
  useFrame: () => {},
}))

vi.mock('../../engine', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  AO_DEFAULT_PARAMS: {},
  ambientOcclusionParamsFor: (mode: string) => (mode === 'realistic' ? {} : null),
  renderSceneFrame: () => {},
  buildAmbientOcclusionPipeline: () =>
    new Promise<FakePipeline>((resolve) => {
      const pipeline: FakePipeline = { dispose: vi.fn(), setSize: vi.fn() }
      collaborators.builds.push({ resolve, pipeline })
    }),
}))

let notes: LiveViewReadinessNotes
let store = createSceneSessionStore()
// A stable-identity spy around the real settle note, so the probe never restarts a build
// and the tests can count exactly when the takeover reports a settled build.
const settleSpy = vi.fn(() => notes.notePipelineSettled())

function Probe({ realistic }: { realistic: boolean }) {
  notes = useLiveViewReadiness()
  return (
    <AmbientOcclusionRenderTakeover
      realistic={realistic}
      onPipelineBuildStarted={notes.notePipelineBuildStarted}
      onPipelineSettled={settleSpy}
    />
  )
}

function ProbeInSession({ realistic }: { realistic: boolean }) {
  return (
    <SceneSessionProvider store={store}>
      <Probe realistic={realistic} />
    </SceneSessionProvider>
  )
}

function drawFrame(): boolean {
  act(() => notes.noteFrameDrawn())
  return store.getSceneSession().frameDrawnSincePipelineSettled
}

function buildAt(index: number): PendingBuild {
  const build = collaborators.builds[index]
  if (!build) throw new Error(`pipeline build ${index} was never started`)
  return build
}

async function settleBuild(index: number): Promise<void> {
  const build = buildAt(index)
  await act(async () => {
    build.resolve(build.pipeline)
    await new Promise((done) => setTimeout(done, 0))
  })
}

function mountRealisticWithBuildPending() {
  const view = render(<ProbeInSession realistic />)
  expect(collaborators.builds).toHaveLength(1)
  expect(drawFrame()).toBe(false)
  return view
}

beforeEach(() => {
  store = createSceneSessionStore()
  settleSpy.mockClear()
  collaborators.builds.length = 0
  collaborators.threeState.camera = {}
})

afterEach(cleanup)

describe('AmbientOcclusionRenderTakeover readiness while a pipeline build is in flight', () => {
  it('counts the live view as ready after the next frame once realistic lighting turns off mid-build', async () => {
    const view = mountRealisticWithBuildPending()

    view.rerender(<ProbeInSession realistic={false} />)
    expect(drawFrame()).toBe(true)
    expect(settleSpy).toHaveBeenCalledTimes(1)

    await settleBuild(0)
    expect(drawFrame()).toBe(true)
    expect(settleSpy).toHaveBeenCalledTimes(1)
    expect(buildAt(0).pipeline.dispose).toHaveBeenCalledTimes(1)
  })

  it('keeps waiting for the replacement build when a camera change replaces a build in flight', async () => {
    const view = mountRealisticWithBuildPending()

    collaborators.threeState.camera = {}
    view.rerender(<ProbeInSession realistic />)
    expect(collaborators.builds).toHaveLength(2)
    expect(drawFrame()).toBe(false)

    await settleBuild(0)
    expect(drawFrame()).toBe(false)

    await settleBuild(1)
    expect(drawFrame()).toBe(true)
  })

  it('keeps waiting for the new build when realistic lighting turns off and on with no frame between', async () => {
    const view = mountRealisticWithBuildPending()

    view.rerender(<ProbeInSession realistic={false} />)
    view.rerender(<ProbeInSession realistic />)
    expect(drawFrame()).toBe(false)

    await settleBuild(0)
    expect(drawFrame()).toBe(false)

    await settleBuild(1)
    expect(drawFrame()).toBe(true)
  })

  it('keeps waiting for the new build when both effects run again in one flush', async () => {
    render(
      <StrictMode>
        <ProbeInSession realistic />
      </StrictMode>,
    )
    // Strict mode runs each effect as setup, cleanup, setup: two builds start in one flush.
    expect(collaborators.builds).toHaveLength(2)
    expect(drawFrame()).toBe(false)

    await settleBuild(0)
    expect(drawFrame()).toBe(false)
    expect(buildAt(0).pipeline.dispose).toHaveBeenCalledTimes(1)

    await settleBuild(1)
    expect(drawFrame()).toBe(true)
  })

  it('reports the settlement once at the unmount and nothing when the stopped build completes late', async () => {
    const view = mountRealisticWithBuildPending()

    view.unmount()
    const callsAtUnmount = settleSpy.mock.calls.length
    expect(callsAtUnmount).toBe(1)

    await expect(settleBuild(0)).resolves.toBeUndefined()

    expect(settleSpy).toHaveBeenCalledTimes(callsAtUnmount)
    expect(store.getSceneSession().frameDrawnSincePipelineSettled).toBe(false)
    expect(buildAt(0).pipeline.dispose).toHaveBeenCalledTimes(1)
  })
})
