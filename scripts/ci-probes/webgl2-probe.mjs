// Standalone investigation script for issue #401's first open question: can
// headless chromium on a linux CI runner produce a usable WebGL2 context via
// a software rasterizer (SwiftShader/ANGLE), with no GPU present?
//
// Launches chromium under several flag combinations, and in each one creates
// a canvas, requests a webgl2 context, reads back the unmasked renderer
// string, and does a tiny render-and-readback smoke test. Prints one JSON
// line per config as it completes (so partial results survive a timeout or
// crash) followed by a final JSON summary array.
//
// This script is dispatched by .github/workflows/webgl2-probe.yml and is not
// part of the app or its test suites. It intentionally always exits 0: a
// config failing to produce a context is a valid, useful result, not a
// script failure.

import { chromium } from '@playwright/test'

const CANVAS_SIZE = 64
const CLEAR_COLOR = [0.25, 0.5, 0.75, 1]
const EXPECTED_PIXEL = [64, 128, 191, 255]
const PIXEL_TOLERANCE = 2

const BASE_CONFIGS = [
  { name: 'default', args: [] },
  { name: 'angle-swiftshader', args: ['--use-gl=angle', '--use-angle=swiftshader'] },
  { name: 'gl-swiftshader', args: ['--use-gl=swiftshader'] },
]

const UNSAFE_SWIFTSHADER_FLAG = '--enable-unsafe-swiftshader'

const UNSAFE_FOLLOWUP_CONFIGS = [
  {
    name: 'angle-swiftshader-unsafe',
    args: ['--use-gl=angle', '--use-angle=swiftshader', UNSAFE_SWIFTSHADER_FLAG],
  },
  { name: 'gl-swiftshader-unsafe', args: ['--use-gl=swiftshader', UNSAFE_SWIFTSHADER_FLAG] },
]

// Playwright serializes this function's source and runs it inside the
// browser page, a separate JS realm from this module. It cannot close over
// this module's top-level constants, so everything it needs travels in via
// the single `probeArgs` parameter passed to page.evaluate below.
function evaluateWebgl2Probe(probeArgs) {
  const { canvasSize, clearColor, expectedPixel, pixelTolerance } = probeArgs

  const canvas = document.createElement('canvas')
  canvas.width = canvasSize
  canvas.height = canvasSize
  const gl = canvas.getContext('webgl2')
  if (!gl) {
    return { contextCreated: false }
  }

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER)
  const vendor = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
    : gl.getParameter(gl.VENDOR)

  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.clearColor(...clearColor)
  gl.clear(gl.COLOR_BUFFER_BIT)

  const pixels = new Uint8Array(canvas.width * canvas.height * 4)
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

  let checksum = 0
  for (let i = 0; i < pixels.length; i += 1) {
    checksum = (checksum + pixels[i] * (i + 1)) >>> 0
  }

  const firstPixelMatchesClearColor = [0, 1, 2, 3].every(
    (channel) => Math.abs(pixels[channel] - expectedPixel[channel]) <= pixelTolerance,
  )

  return {
    contextCreated: true,
    renderer,
    vendor,
    glVersion: gl.getParameter(gl.VERSION),
    shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    renderSmokeTest: { checksum, firstPixelMatchesClearColor },
  }
}

async function runConfig(config) {
  const result = { config: config.name, args: config.args }
  let browser
  try {
    browser = await chromium.launch({ headless: true, args: config.args })
    const page = await browser.newPage()
    const probe = await page.evaluate(evaluateWebgl2Probe, {
      canvasSize: CANVAS_SIZE,
      clearColor: CLEAR_COLOR,
      expectedPixel: EXPECTED_PIXEL,
      pixelTolerance: PIXEL_TOLERANCE,
    })
    Object.assign(result, probe)
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
  return result
}

function isUsableWebgl2(result) {
  return (
    result.contextCreated === true &&
    result.renderSmokeTest !== undefined &&
    result.renderSmokeTest.firstPixelMatchesClearColor === true
  )
}

async function main() {
  const results = []

  for (const config of BASE_CONFIGS) {
    const result = await runConfig(config)
    console.log(JSON.stringify(result))
    results.push(result)
  }

  const anyBaseConfigUsable = results.some(isUsableWebgl2)
  if (!anyBaseConfigUsable) {
    console.log(
      JSON.stringify({
        note: `No base config produced a usable WebGL2 context; retrying with ${UNSAFE_SWIFTSHADER_FLAG}`,
      }),
    )
    for (const config of UNSAFE_FOLLOWUP_CONFIGS) {
      const result = await runConfig(config)
      console.log(JSON.stringify(result))
      results.push(result)
    }
  }

  console.log('--- webgl2-probe summary ---')
  console.log(JSON.stringify(results, null, 2))

  const anyUsable = results.some(isUsableWebgl2)
  console.log(
    `--- webgl2-probe verdict: ${anyUsable ? 'at least one config produced a usable WebGL2 context' : 'no config produced a usable WebGL2 context'} ---`,
  )
}

main().catch((error) => {
  console.error('webgl2-probe crashed:', error)
  process.exitCode = 0
})
