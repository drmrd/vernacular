import type * as THREE from 'three'

import type { AmbientOcclusionParams } from './ambient-occlusion-params'
import type { AmbientOcclusionPipeline } from './render-scene-frame'

// three/webgpu (the entire WebGPU build), three/tsl, and the GTAONode addon load through the
// dynamic imports inside the factory below so they stay off the app's entry chunk (ADR-0148
// records what a static import cost the startup bundle); a source-reading guard test keeps a
// static import from creeping back in.

type AmbientOcclusionModules = [
  typeof import('three/webgpu'),
  typeof import('three/tsl'),
  typeof import('three/addons/tsl/display/GTAONode.js'),
]

// The three lazily loaded modules above are cached the same way sky-environment.ts's
// loadSkyMeshModule caches the sky mesh module: repeated pipeline activations (every
// realistic-mode toggle) share one module load, while buildAmbientOcclusionPipeline below still
// builds a fresh RenderPipeline and GTAONode per call.
let ambientOcclusionModules: Promise<AmbientOcclusionModules> | undefined

function loadAmbientOcclusionModules(): Promise<AmbientOcclusionModules> {
  ambientOcclusionModules ??= Promise.all([
    import('three/webgpu'),
    import('three/tsl'),
    import('three/addons/tsl/display/GTAONode.js'),
  ])
  return ambientOcclusionModules
}

// A type-only alias for the WebGPU renderer, derived from the lazily loaded three/webgpu
// module's own type via `typeof import(...)` rather than a static `import type { ... } from ...`
// statement. That statement's `from '<specifier>'` text is exactly what the guard test checks
// for, so this keeps the module's only reference to the specifier inside a dynamic `import(...)`,
// matching how sky-environment.ts derives its SkyMesh type.
type WebGpuModule = typeof import('three/webgpu')
type WebGPURenderer = InstanceType<WebGpuModule['WebGPURenderer']>

/**
 * Builds a RenderPipeline that renders the scene with the GTAONode occlusion term applied to
 * indirect light alone. The term reaches the scene through `builtinAOContext` installed as the
 * scene pass's context node, which routes it into the lighting model's ambient-occlusion hook:
 * the scene's indirect diffuse and specular darken while direct sunlight keeps its full
 * strength, which is the physically correct blend. Multiplying the occlusion across the finished
 * frame instead (ADR-0151's first output node) dimmed the sun along with everything else.
 * The occlusion node reads depth from a separate depth-only prepass so that rendering it cannot
 * re-enter the context installed on the scene pass. Normals are reconstructed from depth (no
 * multiple-render-target output; see the slice spec's backend-parity posture). The pipeline's
 * default output handling carries the renderer's active tone-mapping operator, so realistic AgX
 * (ADR-0147) still applies after the pass takes over the draw. three/webgpu, three/tsl, and the
 * GTAONode addon load through loadAmbientOcclusionModules's cached lazy dynamic import so the
 * WebGPU build stays off the entry chunk and repeated calls (every realistic-mode toggle) share
 * one module load; this function still builds a fresh RenderPipeline and GTAONode per call, and
 * the returned dispose releases both passes, the occlusion node (its render target and material
 * included), and the prepass override material.
 */
// eslint-disable-next-line max-params -- renderer, scene, and camera are the RenderPipeline's irreducible construction inputs and params is the GTAONode tuning; splitting them would only wrap the same four values in a throwaway object
export async function buildAmbientOcclusionPipeline(
  renderer: WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  params: AmbientOcclusionParams,
): Promise<AmbientOcclusionPipeline> {
  const [{ MeshBasicNodeMaterial, RenderPipeline }, { builtinAOContext, pass, screenUV }, { ao }] =
    await loadAmbientOcclusionModules()

  const scenePass = pass(scene, camera)

  // The occlusion node reads depth from its own pass rather than from the scene pass, so that
  // rendering it cannot re-enter the ambient-occlusion context installed on the scene pass
  // below. A cheap override material suffices because the occlusion node reads only the
  // resulting depth texture, never this pass's color output. MeshBasicNodeMaterial is the
  // minimal node material with no lighting to compute; a dedicated depth-material class is
  // unnecessary since depth writes happen regardless of which material draws the pass.
  const depthPrepass = pass(scene, camera)
  const depthPrepassMaterial = new MeshBasicNodeMaterial()
  depthPrepass.overrideMaterial = depthPrepassMaterial

  // GTAONode reconstructs surface normals from depth when no normal node is supplied, which
  // keeps the pass clear of the multiple-render-target output that diverged between backends
  // before r174 (three.js issue #30567). The r184 type declares normalNode non-null, so the
  // depth-only path passes null through a cast at this one call site.
  const reconstructNormalsFromDepth = null as unknown as Parameters<typeof ao>[1]
  const aoNode = ao(depthPrepass.getTextureNode('depth'), reconstructNormalsFromDepth, camera)
  aoNode.radius.value = params.radius
  aoNode.scale.value = params.scale
  aoNode.thickness.value = params.thickness
  aoNode.distanceExponent.value = params.distanceExponent
  aoNode.distanceFallOff.value = params.distanceFallOff
  aoNode.samples.value = params.sampleCount

  // The occlusion buffer covers the screen, but a texture read from inside a scene material
  // resolves its default coordinates to the mesh's own UV set, so the sample is rebound to
  // screen space before the lighting model consumes it.
  const occlusion = aoNode.getTextureNode().context({ getUV: () => screenUV })
  scenePass.contextNode = builtinAOContext(occlusion.r)

  const pipeline = new RenderPipeline(renderer)
  pipeline.outputNode = scenePass.getTextureNode('output')

  return {
    render: () => {
      pipeline.render()
    },
    setSize: () => {
      // The r184 RenderPipeline exposes no size API: its PassNode reconciles its own render
      // target to renderer.getSize() during updateBefore on every frame, and renderer.setSize
      // is owned by the canvas layer. Resizing here would be redundant, so this is a no-op.
    },
    dispose: () => {
      pipeline.dispose()
      scenePass.dispose()
      depthPrepass.dispose()
      depthPrepassMaterial.dispose()
      aoNode.dispose()
    },
  }
}
