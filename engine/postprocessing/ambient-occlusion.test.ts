import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('ambient-occlusion module imports', () => {
  // This is a source-reading guard, not a behavior test. It pins a *bundling* property no
  // runtime assertion can observe: this module must not STATICALLY import three/webgpu,
  // three/tsl, or the GTAONode addon. Any one of those drags the whole WebGPU node-material
  // system onto the app's startup path, the same regression ADR-0148 records for the sky mesh
  // (the entry chunk grew from ~2.0MB to ~2.6MB when that module statically imported its addon).
  // The pipeline must build lazily, at construction time, via a dynamic `import(...)`.
  // `import type` is erased at compile time and a dynamic `import(...)` has no `from`, so
  // neither of those counts here. Note this regex spans the whole source with a lazy
  // `[\s\S]*?`, so it does not anchor per statement: an unrelated static import earlier in the
  // file can still cause a later `import type` of a guarded specifier to be flagged. That is a
  // known limitation inherited from the precedent guard, not something this test tries to fix.
  const importsStaticValueOf = (source: string, specifier: string): boolean => {
    const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // A static value import always reaches a `from '<specifier>'` and is not `import type`;
    // a dynamic `import(...)` has no `from`, so requiring `from` excludes the lazy boundary.
    const staticValueImport = new RegExp(
      String.raw`import\s+(?!type\b)[\s\S]*?from\s*['"]${escaped}['"]`,
    )
    const bareSideEffectImport = new RegExp(String.raw`import\s+['"]${escaped}['"]`)
    return staticValueImport.test(source) || bareSideEffectImport.test(source)
  }

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
