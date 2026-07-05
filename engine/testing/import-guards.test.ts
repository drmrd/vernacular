import { describe, it, expect } from 'vitest'
import { importsStaticValueOf } from './import-guards'

const GUARDED_SPECIFIER = 'three/webgpu'

describe('importsStaticValueOf', () => {
  it('detects a static namespace import of the guarded specifier', () => {
    const source = `import * as WebGPU from '${GUARDED_SPECIFIER}'`
    expect(importsStaticValueOf(source, GUARDED_SPECIFIER)).toBe(true)
  })

  it('detects a static named import spanning multiple lines', () => {
    const source = `import {\n  WebGPURenderer,\n} from '${GUARDED_SPECIFIER}'\n`
    expect(importsStaticValueOf(source, GUARDED_SPECIFIER)).toBe(true)
  })

  it('detects a bare side-effect import', () => {
    const source = `import '${GUARDED_SPECIFIER}'\n`
    expect(importsStaticValueOf(source, GUARDED_SPECIFIER)).toBe(true)
  })

  it('does not flag an import type of the guarded specifier', () => {
    const source = `import type { WebGPURenderer } from '${GUARDED_SPECIFIER}'\n`
    expect(importsStaticValueOf(source, GUARDED_SPECIFIER)).toBe(false)
  })

  it('does not flag a dynamic import of the guarded specifier', () => {
    const source = `const load = () => import('${GUARDED_SPECIFIER}')\n`
    expect(importsStaticValueOf(source, GUARDED_SPECIFIER)).toBe(false)
  })

  it('does not flag a `typeof import(...)` type query of the guarded specifier', () => {
    const source = `type Renderer = typeof import('${GUARDED_SPECIFIER}')\n`
    expect(importsStaticValueOf(source, GUARDED_SPECIFIER)).toBe(false)
  })

  // Pins the anchor to the `import` KEYWORD, not the bare substring. A tempered
  // scan that stopped at any "import" text would halt inside `reimportHelper` and
  // silently fail OPEN on this genuine static import (the guard's worst failure
  // mode: a real regression reported as clean).
  it('still flags a static import whose clause identifier contains "import" as a substring', () => {
    const source = `import { reimportHelper } from '${GUARDED_SPECIFIER}'`
    expect(importsStaticValueOf(source, GUARDED_SPECIFIER)).toBe(true)
  })

  // Pins the specifier-escaping step: the dot in '.js' must match only a literal
  // dot. An unescaped specifier would let `.` match the 'X' in this near-miss
  // source, so a regression in the escaping actually flips this assertion.
  it('does not flag a specifier differing from the guarded one only at a regex metacharacter', () => {
    const specifier = 'three/addons/tsl/display/GTAONode.js'
    const source = "import { GTAONode } from 'three/addons/tsl/display/GTAONodeXjs'"
    expect(importsStaticValueOf(source, specifier)).toBe(false)
  })

  // The fixed false positive: sky-environment.ts opens with a genuine static value
  // import of a DIFFERENT specifier ('three'), followed by `import type` lines. The
  // precedent regex spanned the whole source with a lazy `[\s\S]*?`, so it could
  // stitch that first "import" together with a later, unrelated `from
  // 'three/webgpu'` even though the statement carrying it was `import type`. The
  // per-statement anchor stops the match at the next `import` keyword, so the two
  // statements can no longer be read as one.
  it('does not flag an import type behind an earlier, unrelated static import', () => {
    const source = [
      "import * as THREE from 'three'",
      "import type { EnvironmentLighting } from '../../core'",
      `import type { WebGPURenderer } from '${GUARDED_SPECIFIER}'`,
    ].join('\n')
    expect(importsStaticValueOf(source, GUARDED_SPECIFIER)).toBe(false)
  })

  // Regression coverage for the fix above: an unrelated import ahead of a REAL
  // static value import of the guarded specifier must still be caught.
  it('still detects a genuine static import that follows an unrelated import', () => {
    const source = [
      "import type { Foo } from 'other'",
      `import * as WebGPU from '${GUARDED_SPECIFIER}'`,
    ].join('\n')
    expect(importsStaticValueOf(source, GUARDED_SPECIFIER)).toBe(true)
  })

  // Deliberately-broken fixtures modeled on the two production guards this helper
  // backs, proving the tightened regex still flags a module that has genuinely
  // regressed back to a static import.
  it('still flags a sky-environment-shaped fixture that reintroduces a static SkyMesh import', () => {
    const specifier = 'three/examples/jsm/objects/SkyMesh.js'
    const source = [
      "import * as THREE from 'three'",
      "import type { EnvironmentLighting } from '../../core'",
      "import type { LightingRig } from './lighting-rig'",
      `import { SkyMesh } from '${specifier}'`,
    ].join('\n')
    expect(importsStaticValueOf(source, specifier)).toBe(true)
  })

  it('still flags an ambient-occlusion-shaped fixture that reintroduces a static three/tsl import', () => {
    const specifier = 'three/tsl'
    const source = [
      "import type * as THREE from 'three'",
      "import type { AmbientOcclusionParams } from './ambient-occlusion-params'",
      `import { ao } from '${specifier}'`,
    ].join('\n')
    expect(importsStaticValueOf(source, specifier)).toBe(true)
  })
})
