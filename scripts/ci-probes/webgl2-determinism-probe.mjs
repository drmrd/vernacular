// Standalone investigation script for issue #401's second open question: once a
// headless chromium on this linux CI runner can create a usable WebGL2 context
// through a software rasterizer (SwiftShader/ANGLE Subzero, confirmed by
// webgl2-probe.mjs), is that rasterizer's rendered output deterministic from one
// browser launch to the next?
//
// Unlike webgl2-probe.mjs's synthetic clear-color canvas, this probe exercises the
// app's real deterministic render harness (the `?fixture=scene-harness` seam; see
// app/app.tsx and e2e/tests/scene-solar.spec.ts). For each canonical harness state
// it: launches a fresh headless chromium with default flags, serves the production
// build, navigates to the harness fixture, waits for `data-harness-ready`,
// screenshots the canvas element, closes the browser completely, then repeats with
// a brand new browser process. Two independent process lifetimes per state, not two
// screenshots from one page or one browser, so the comparison actually probes
// run-to-run determinism of the software rasterizer rather than in-process frame
// caching. The two screenshots are compared byte-for-byte (size and sha256).
//
// This script is dispatched by .github/workflows/webgl2-probe.yml and is not part
// of the app or its test suites. It expects `pnpm build` to have already produced
// `dist/` and starts its own `vite preview` server against it. It intentionally
// always exits 0: a mismatch between the two runs is a valid, useful result, not a
// script failure.

import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const PREVIEW_PORT = 4173
const BASE_URL = `http://localhost:${PREVIEW_PORT}`
const SERVER_READY_TIMEOUT_MS = 30_000
const SERVER_POLL_INTERVAL_MS = 250

// Generous: the sky-lit states load their realistic lighting through a lazily
// loaded chunk (see scene-solar.spec.ts) before `data-harness-ready` flips.
const HARNESS_READY_TIMEOUT_MS = 20_000

const OUTPUT_DIR = path.join('ci-probe-output', 'webgl2-determinism')

// The two canonical states this probe checks: the harness default (schematic
// lighting, no `scene` param, matching scene-visual-regression.spec.ts's
// `scene-shell-webgl.png` baseline) and one realistic sky-lit solar state
// (`equinox-noon`, matching scene-solar.spec.ts). Both resolve through
// app/harness-environment.ts to a fixed site and observation instant, so any
// difference between two independent runs of the same state points at the
// rasterizer, not at nondeterministic scene input.
const STATES = [
  { name: 'default-shell', query: '' },
  { name: 'equinox-noon', query: '&scene=equinox-noon' },
]

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      try {
        const response = await fetch(url)
        if (response.ok || response.status === 404) {
          resolve()
          return
        }
      } catch {
        // Not up yet; fall through to retry below.
      }
      if (Date.now() > deadline) {
        reject(new Error(`Timed out waiting for ${url}`))
        return
      }
      setTimeout(attempt, SERVER_POLL_INTERVAL_MS)
    }
    void attempt()
  })
}

async function startPreviewServer() {
  const server = spawn('pnpm', ['preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => process.stdout.write(`[preview] ${chunk}`))
  server.stderr.on('data', (chunk) => process.stderr.write(`[preview] ${chunk}`))
  await waitForServer(BASE_URL, SERVER_READY_TIMEOUT_MS)
  return server
}

async function stopPreviewServer(server) {
  server.kill()
  await new Promise((resolve) => server.once('exit', resolve))
}

// Launches one fresh, fully independent browser process, navigates to the given
// harness state, waits for readiness, and screenshots the canvas. Closing the
// browser (not just the page) between the two captures for a state is the point:
// it forces a brand new SwiftShader/ANGLE process rather than reusing a
// warmed-up GPU-process context.
async function captureFreshRender(query) {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(`${BASE_URL}/?fixture=scene-harness${query}`)

    const harness = page.locator('[data-testid="scene-harness"]')
    const canvas = harness.locator('canvas')
    await canvas.waitFor({ state: 'visible', timeout: HARNESS_READY_TIMEOUT_MS })
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="scene-harness"]')
          ?.getAttribute('data-harness-ready') === 'true',
      undefined,
      { timeout: HARNESS_READY_TIMEOUT_MS },
    )

    return await canvas.screenshot()
  } finally {
    await browser.close()
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function runState(state) {
  const run1 = await captureFreshRender(state.query)
  const run2 = await captureFreshRender(state.query)

  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeFile(path.join(OUTPUT_DIR, `${state.name}-run1.png`), run1)
  await writeFile(path.join(OUTPUT_DIR, `${state.name}-run2.png`), run2)

  const run1Digest = { bytes: run1.length, sha256: sha256(run1) }
  const run2Digest = { bytes: run2.length, sha256: sha256(run2) }
  const identical = run1Digest.bytes === run2Digest.bytes && run1Digest.sha256 === run2Digest.sha256

  return { state: state.name, query: state.query, run1: run1Digest, run2: run2Digest, identical }
}

async function main() {
  const server = await startPreviewServer()
  const results = []
  try {
    for (const state of STATES) {
      const result = await runState(state)
      console.log(JSON.stringify(result))
      results.push(result)
    }
  } finally {
    await stopPreviewServer(server)
  }

  console.log('--- webgl2-determinism-probe summary ---')
  console.log(JSON.stringify(results, null, 2))

  const allIdentical = results.length > 0 && results.every((result) => result.identical)
  console.log(
    `--- webgl2-determinism-probe verdict: ${
      allIdentical
        ? 'byte-identical across independent browser launches for every state'
        : 'at least one state differed across independent browser launches'
    } ---`,
  )
}

main().catch((error) => {
  console.error('webgl2-determinism-probe crashed:', error)
  process.exitCode = 0
})
