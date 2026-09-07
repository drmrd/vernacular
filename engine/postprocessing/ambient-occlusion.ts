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
 * frame instead (ADR-0151's first output node) dimmed the sun along with everything else. The
 * occlusion node reads depth and view-space normals from a separate prepass so that rendering it
 * cannot re-enter the context installed on the scene pass. That prepass renders the normals GTAO
 * consumes instead of leaving it to reconstruct them from depth, a reconstruction that rounds
 * creases and thin details off (ADR-0173). The pipeline's default output handling carries the
 * renderer's active tone-mapping operator, so realistic AgX (ADR-0147) still applies after the
 * pass takes over the draw. three/webgpu, three/tsl, and the GTAONode addon load through
 * loadAmbientOcclusionModules's cached lazy dynamic import so the WebGPU build stays off the
 * entry chunk and repeated calls (every realistic-mode toggle) share one module load; this
 * function still builds a fresh RenderPipeline and GTAONode per call, and the returned dispose
 * releases both passes, the occlusion node (its render target and material included), and the
 * prepass override material.
 */
// eslint-disable-next-line max-params -- renderer, scene, and camera are the RenderPipeline's irreducible construction inputs and params is the GTAONode tuning; splitting them would only wrap the same four values in a throwaway object
export async function buildAmbientOcclusionPipeline(
  renderer: WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  params: AmbientOcclusionParams,
): Promise<AmbientOcclusionPipeline> {
  const [{ MeshBasicNodeMaterial, RenderPipeline }, tslModule, { ao }] =
    await loadAmbientOcclusionModules()
  const { builtinAOContext, normalView, pass, screenUV, vec4 } = tslModule

  const scenePass = pass(scene, camera)

  // The occlusion node reads depth and normals from its own pass rather than from the scene
  // pass, so that rendering it cannot re-enter the ambient-occlusion context installed on the
  // scene pass below. The override material draws every surface as its view-space normal, so
  // this pass's color output carries the normals GTAO samples. Rendered normals hold the true
  // orientation of each face at a crease, where reconstructing a normal from neighboring depth
  // samples blends the two faces into one slanted plane and washes the contact shadow out
  // (ADR-0173). MeshBasicNodeMaterial is the minimal node material with no lighting to compute,
  // and the normal goes through outputNode rather than colorNode because the color path clamps
  // its result at zero (NodeMaterial's "force unsigned floats" step), which would flatten every
  // negative normal component. The pass render target is HalfFloatType, so signed components
  // survive unencoded and the normal is written raw: GTAONode samples the normal texture's rgb
  // and normalizes it, with no unpacking step to match.
  const prepass = pass(scene, camera)
  const prepassMaterial = new MeshBasicNodeMaterial()
  prepassMaterial.outputNode = vec4(normalView, 1)
  prepass.overrideMaterial = prepassMaterial

  const aoNode = ao(prepass.getTextureNode('depth'), prepass.getTextureNode('output'), camera)
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
      prepass.dispose()
      prepassMaterial.dispose()
      aoNode.dispose()
    },
  }
}
