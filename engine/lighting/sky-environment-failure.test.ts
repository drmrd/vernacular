import { describe, it, expect, vi, afterEach } from 'vitest'
import * as THREE from 'three'
import { attachSkyEnvironment } from './sky-environment'
import { buildLightingRig, type LightingRig } from './lighting-rig'

// The classic single-page-app failure: after a redeploy the hashed SkyMesh chunk URL is
// stale, so the browser's dynamic import rejects. This file mocks the addon module so its
// import always rejects, exercising the failed-chunk-load path end to end. The mock is
// file-scoped on purpose: sky-environment.ts caches its import promise at module scope, so
// a failing import and a real one cannot coexist in one file. The happy-path suite lives in
// sky-environment.test.ts, unmocked. A factory that throws makes the dynamic
// `import('three/examples/jsm/objects/SkyMesh.js')` reject with this error.
vi.mock('three/examples/jsm/objects/SkyMesh.js', () => {
  throw new Error('simulated stale SkyMesh chunk: 404')
})

/** The sun intensity the rig is built with; any positive value is fine for these tests. */
const RIG_SUN_INTENSITY = 1.6

/** A scene with the solar rig already applied: the state attachSkyEnvironment expects. */
function makeAppliedRig(): { scene: THREE.Scene; rig: LightingRig } {
  const scene = new THREE.Scene()
  const rig = buildLightingRig(scene, RIG_SUN_INTENSITY)
  return { scene, rig }
}

/** True when the scene carries a visible sky mesh, read via the addon's own marker flag so
 *  the test never has to statically import (and so bundle) the SkyMesh addon itself. */
function sceneHasSkyMesh(scene: THREE.Object3D): boolean {
  return scene.children.some((child) => (child as { isSkyMesh?: boolean }).isSkyMesh === true)
}

/** The first console.warn call's arguments, stringified and joined, for message matching. */
function firstWarning(spy: ReturnType<typeof vi.spyOn>): string {
  return (spy.mock.calls[0] ?? []).map(String).join(' ')
}

describe('attachSkyEnvironment when the SkyMesh chunk fails to load', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('degrades gracefully: resolves, warns once, and leaves the scene lit without a sky', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { scene, rig } = makeAppliedRig()

    const attached = attachSkyEnvironment(scene, rig)

    // A stale hashed chunk is a routine SPA failure, not a crash: the attach must swallow
    // the rejected import and resolve, so a caller awaiting the sky is never left hanging
    // on an unhandled rejection.
    await expect(attached).resolves.toBeUndefined()

    // Exactly one diagnosable warning names the module that failed, so the failure is
    // traceable in the console rather than silently swallowed.
    expect(warn).toHaveBeenCalledTimes(1)
    expect(firstWarning(warn)).toMatch(/SkyMesh/)

    // No sky joins the scene and none is recorded on the rig: there is nothing to show.
    expect(rig.sky).toBeUndefined()
    expect(sceneHasSkyMesh(scene)).toBe(false)

    // The probe attached and the fill zeroed synchronously, before the import failed, so
    // the scene stays lit from the probe's ambient even though the visible sky never came.
    expect(rig.probe).toBeInstanceOf(THREE.LightProbe)
    expect(scene.children).toContain(rig.probe)
    expect(rig.fill.intensity).toBe(0)
  })
})
