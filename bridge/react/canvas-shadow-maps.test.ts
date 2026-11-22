import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// This is a source-reading guard, not a behavior test. It pins a *configuration* property no
// runtime assertion can observe: mounting either Canvas needs a real WebGL context, which jsdom
// does not provide. The property matters because React Three Fiber 9 unconditionally overwrites
// the renderer's shadow-map setting during Canvas configuration (search the fiber source for the
// literal `gl.shadowMap.enabled = !!shadows` to find the assignment).
// engine/renderer/create-renderer.ts sets `renderer.shadowMap.enabled = true` at construction,
// but without the `shadows` prop on `<Canvas>`, React Three Fiber silently flips that back off
// and the directional sun's shadows (whose rig, bias, and fitters all exist and are unit-tested
// elsewhere) never actually render.
//
// Both views render the shared SceneRendererCanvas wrapper, which forwards every prop but `gl`
// to the real React Three Fiber Canvas. So the guard has two halves: each view passes `shadows`
// to the wrapper, and the wrapper spreads its props onto the real `<Canvas>`.
const VIEW_FILES = ['bridge/react/scene-harness-view.tsx', 'bridge/react/live-scene-view.tsx']
const WRAPPER_FILE = 'bridge/react/scene-renderer-canvas.tsx'

// Finds the `>` that closes the opening tag: the first `>` not preceded by `=`, so the `=>` of
// an arrow-function prop (like the Canvas `gl` factory) never truncates the tag early. A textual
// scan, not a parser; a bare `>` inside a string or comment within the tag would still end the
// scan, but no such text appears in the Canvas tags this guard reads.
function indexOfTagClose(source: string, from: number): number {
  let candidate = source.indexOf('>', from)
  while (candidate !== -1 && source[candidate - 1] === '=') {
    candidate = source.indexOf('>', candidate + 1)
  }
  return candidate
}

// Extracts the opening `<tagName ...>` tag from a source file's text, scoping the search so a
// stray mention of "shadows" in a comment elsewhere in the file cannot produce a false pass.
// The tag name is followed by whitespace or `>`, so `<Canvas` does not match `<CanvasLike`.
function extractOpeningTag(source: string, tagName: string): string {
  const start = source.search(new RegExp(`<${tagName}[\\s>]`))
  if (start === -1) {
    throw new Error(`no <${tagName}> element found in source`)
  }
  const end = indexOfTagClose(source, start)
  if (end === -1) {
    throw new Error(`unterminated <${tagName}> opening tag`)
  }
  return source.slice(start, end + 1)
}

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('scene canvases enable shadow-map rendering', () => {
  it('passes the shadows prop on both the harness and live-view scene canvas elements', () => {
    for (const relativePath of VIEW_FILES) {
      const openingTag = extractOpeningTag(readSource(relativePath), 'SceneRendererCanvas')

      expect(openingTag).toMatch(/\bshadows\b/)
    }
  })

  it('forwards the scene canvas props to the real Canvas element', () => {
    const openingTag = extractOpeningTag(readSource(WRAPPER_FILE), 'Canvas')

    expect(openingTag).toMatch(/\{\.\.\.canvasProps\}/)
  })
})
