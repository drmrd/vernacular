import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { importsStaticValueOf } from '../testing'

describe('ambient-occlusion module imports', () => {
  // This is a source-reading guard, not a behavior test. It pins a *bundling* property no
  // runtime assertion can observe: this module must not STATICALLY import three/webgpu,
  // three/tsl, or the GTAONode addon. Any one of those drags the whole WebGPU node-material
  // system onto the app's startup path, the same regression ADR-0148 records for the sky mesh
  // (the entry chunk grew from ~2.0MB to ~2.6MB when that module statically imported its addon).
  // The pipeline must build lazily, at construction time, via a dynamic `import(...)`. See
  // engine/testing/import-guards.ts for how the static-vs-type-vs-dynamic import distinction is
  // made; that helper is shared with the equivalent sky-environment.test.ts guard.
  it('never puts the WebGPU build, TSL, or the GTAONode addon on the startup path via a static import', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'engine/postprocessing/ambient-occlusion.ts'),
      'utf8',
    )

    expect(importsStaticValueOf(source, 'three/webgpu')).toBe(false)
    expect(importsStaticValueOf(source, 'three/tsl')).toBe(false)
    expect(importsStaticValueOf(source, 'three/addons/tsl/display/GTAONode.js')).toBe(false)
  })
})

describe('ambient-occlusion light blend', () => {
  // This is a source-reading guard, not a behavior test. It pins a *lighting-model*
  // property no runtime assertion can observe: multiplying the whole composited frame
  // by the occlusion texture also dims direct sunlight, which is not how occlusion works
  // in the real world: only bounced, indirect light gets blocked by nearby geometry. The
  // physically correct blend routes the occlusion term through three r184's
  // builtinAOContext lighting-context seam, so it darkens indirect light while leaving
  // direct sun untouched. ADR-0172 records this decision.
  it('applies occlusion through the indirect-light context instead of darkening the whole frame', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'engine/postprocessing/ambient-occlusion.ts'),
      'utf8',
    )

    expect(source).toContain('builtinAOContext')
    // Rename-proof guard: reject any outputNode assignment that multiplies the scene
    // color by something, the shape a reintroduced whole-frame darken would take,
    // regardless of what the multiplied variable happens to be called.
    expect(source).not.toMatch(/outputNode\s*=\s*\w+\.mul\(/)
  })
})

describe('ambient-occlusion normals source', () => {
  // This is a source-reading guard, not a behavior test. It pins a *normal-quality*
  // property no runtime assertion can observe: reconstructing normals from depth
  // (derivative-based, screen-space differencing) softens and misplaces occlusion at
  // creases and other high-curvature geometry, exactly where occlusion should read
  // sharpest. The GTAO addon's own docs recommend normals via MRT from the main
  // scene pass, but this repo runs a no-MRT pipeline (ADR-0151/ADR-0172), so
  // Vernacular instead renders a separate normals texture in a depth-prepass
  // override material, writing view-space normals (normalView) into the prepass
  // color target instead of leaving GTAO to guess them from depth. ADR-0173
  // records this decision.
  it('feeds GTAO rendered view-space normals instead of reconstructing them from depth', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'engine/postprocessing/ambient-occlusion.ts'),
      'utf8',
    )

    expect(source).not.toContain('reconstructNormalsFromDepth')
    expect(source).toContain('normalView')
  })
})
