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
