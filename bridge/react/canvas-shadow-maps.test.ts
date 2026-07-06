import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// This is a source-reading guard, not a behavior test. It pins a *configuration* property no
// runtime assertion can observe: mounting either Canvas needs a real WebGL context, which jsdom
// does not provide. The property matters because React Three Fiber 9 unconditionally overwrites
// the renderer's shadow-map setting during Canvas configuration with
// `gl.shadowMap.enabled = !!shadows` (verified at @react-three/fiber 9.6.1 dist line ~15795).
// engine/renderer/create-renderer.ts sets `renderer.shadowMap.enabled = true` at construction,
// but without the `shadows` prop on `<Canvas>`, React Three Fiber silently flips that back off
// and the directional sun's shadows (whose rig, bias, and fitters all exist and are unit-tested
// elsewhere) never actually render.
const SOURCE_FILES = ['bridge/react/scene-harness-view.tsx', 'bridge/react/webgpu-scene-view.tsx']

// Extracts the opening `<Canvas ...>` tag from a source file's text, scoping the search so a
// stray mention of "shadows" in a comment elsewhere in the file cannot produce a false pass.
function extractCanvasOpeningTag(source: string): string {
  const start = source.indexOf('<Canvas')
  if (start === -1) {
    throw new Error('no <Canvas element found in source')
  }
  const end = source.indexOf('>', start)
  if (end === -1) {
    throw new Error('unterminated <Canvas opening tag')
  }
  return source.slice(start, end + 1)
}

describe('scene canvases enable shadow-map rendering', () => {
  it('passes the shadows prop on both the harness and live-view Canvas elements', () => {
    for (const relativePath of SOURCE_FILES) {
      const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8')
      const openingTag = extractCanvasOpeningTag(source)

      expect(openingTag).toMatch(/\bshadows\b/)
    }
  })
})
