import { test, expect, type Page } from '@playwright/test'
import {
  liveSceneCanvas,
  settledLiveFrame,
  waitForLiveCanvasReady,
  waitForLiveFrameDifferentFrom,
  waitForLiveFrameEqualTo,
} from './live-pane-frames'

// Issue #821: the 3D canvas wrapper releases its renderer when the view closes (ADR-0197). Every
// unit test of that rule uses a renderer double. This case runs the real renderer: it opens the
// live pane, closes it, opens it again, three times, and requires that the pane draws each time,
// that the release ran exactly once for each close, and that the console stays clean.
//
// The canvas library tears down its own state a fixed time after the canvas unmounts, which is
// after the wrapper has released the renderer. The waits below cover that delayed teardown. It
// wraps its whole body in try and catch and drops any throw, so a clean console cannot show a
// fault in it. What detects a missing or a double release is the release counters
// (GPUDevice.destroy on the WebGPU path, loseContext on the WebGL 2 fallback). The frame check
// shows that the pane draws again after the teardown ran. The console check catches the errors,
// warnings, and uncaught page errors that the app and the renderer do print.
//
// The case runs on both paths of the scene-webgl project. With a WebGPU adapter (the development
// Mac) the pane draws through WebGPU. With no adapter (the Linux runner, where navigator.gpu is
// present and requestAdapter resolves to null) three's own WebGL 2 backend draws the pane. Like
// the neighbouring live-view specs it self-skips only without navigator.gpu.
//
// Like them it reads what the renderer drew and not only a marker. Each open waits for the
// readiness marker of its own mount (see live-pane-frames.ts) and then must show the frame that the
// first open drew for the same project: a canvas-only capture, which differs from the empty floor
// (so it holds the wall) and is steady. The marker data-live-view-ready is not used, because it
// can still read true from the earlier open when the pane mounts again.

// @react-three/fiber 9.6.1 (dist/events-*.js, unmountComponentAtNode) tears a root down in a
// setTimeout with the inline literal 500 ms, started once its React tree has unmounted. The
// literal has no name in the library. This is one of the rare places where a fixed wait is the
// thing under test: the teardown runs after that timer fires, and nothing in the page marks the
// firing, so the case waits past it before it counts releases and opens the pane again. 800 ms
// leaves 300 ms of margin over the timer.
const LIBRARY_TEARDOWN_MS = 500
const TEARDOWN_WAIT_MS = LIBRARY_TEARDOWN_MS + 300

// Three cycles of close and open show that a second and a third open work, and that the release
// does not depend on the first open being special.
const CYCLES = 3

// The messages the page prints on this path that have nothing to do with the renderer's release.
// Each is matched whole, so any other warning, and any other wording of these, still fails.
//
// - @react-three/fiber 9.6.1 creates a THREE.Clock for the store of each canvas it mounts (the line
//   `clock: new THREE.Clock()` in dist/events-*.js), and three 0.184 prints this deprecation
//   notice from the Clock constructor. It appears once for each open of the pane, at mount, and
//   not at a close.
// - The next two appear only where no WebGPU adapter exists (the Linux runner, and the plain
//   headless shell): the browser says that requestAdapter found none, and three notes that it
//   runs its WebGL 2 backend. They appear once for each open, at renderer start-up.
// - The last is a Chrome GL driver performance hint, with a per-context id, about a GPU stall on
//   a pixel read. It comes with the WebGL 2 backend while this case captures the canvas, and
//   Chrome prints it four times at most.
const KNOWN_UNRELATED_MESSAGES: readonly RegExp[] = [
  /^console\.warning: THREE\.Clock: This module has been deprecated\. Please use THREE\.Timer instead\.$/,
  /^console\.warning: No available adapters\.$/,
  /^console\.warning: THREE\.WebGPURenderer: WebGPU is not available, running under WebGL2 backend\.$/,
  /^console\.warning: \[\.WebGL-0x[0-9a-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels( \(this message will no longer repeat\))?$/,
]

type Point = { x: number; y: number }

interface ReleaseCounterWindow {
  rendererReleases?: { webGpuDevicesDestroyed: number; webGlContextsLost: number }
}

// Counts the calls that free a renderer's GPU resources, from page script, so the product needs
// no test hook. Three's dispose() ends in GPUDevice.destroy() on the WebGPU backend and in
// WEBGL_lose_context.loseContext() on its WebGL 2 backend. Must run before goto.
async function countRendererReleases(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const counts = { webGpuDevicesDestroyed: 0, webGlContextsLost: 0 }
    ;(window as unknown as ReleaseCounterWindow).rendererReleases = counts

    type Destroyable = { prototype: { destroy: () => void } }
    const gpuDevice = (globalThis as unknown as Record<string, Destroyable | undefined>)[
      'GPUDevice'
    ]
    if (gpuDevice !== undefined) {
      const destroy = gpuDevice.prototype.destroy
      gpuDevice.prototype.destroy = function (this: unknown) {
        counts.webGpuDevicesDestroyed += 1
        return destroy.call(this)
      }
    }

    type LooseContext = { getExtension: (name: string) => { loseContext?: () => void } | null }
    const contextProto = WebGL2RenderingContext.prototype as unknown as LooseContext
    const wrapped = new WeakSet<object>()
    const getExtension = contextProto.getExtension
    contextProto.getExtension = function (this: unknown, name: string) {
      const extension = getExtension.call(this, name)
      if (name === 'WEBGL_lose_context' && extension !== null && !wrapped.has(extension)) {
        wrapped.add(extension)
        const loseContext = extension.loseContext?.bind(extension)
        extension.loseContext = () => {
          counts.webGlContextsLost += 1
          loseContext?.()
        }
      }
      return extension
    }
  })
}

// How many times the page freed a renderer so far, on either backend.
async function rendererReleaseCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const counts = (window as unknown as ReleaseCounterWindow).rendererReleases
    return counts === undefined ? 0 : counts.webGpuDevicesDestroyed + counts.webGlContextsLost
  })
}

// Every console error, console warning, and uncaught page error, in order, from the call to
// the end of the test.
function collectConsoleProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`console.${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => {
    problems.push(`pageerror: ${error.message}`)
  })
  return problems
}

// Commits one wall run in the plan pane: arm the Wall tool, click the two endpoints, then
// press Enter so the buffered run commits.
async function drawWall(page: Page, segment: { from: Point; to: Point }): Promise<void> {
  const plan = page.getByLabel('Floor plan')
  await expect(plan).toBeVisible()
  await page.getByRole('radio', { name: 'Wall', exact: true }).click()
  await plan.click({ position: segment.from })
  await plan.click({ position: segment.to })
  await page.keyboard.press('Enter')
  await expect(page.getByRole('option', { name: /^Wall,/ })).toHaveCount(1)
}

test.describe('Live three-dimensional pane opened and closed again', () => {
  test('draws again after each close and open, releases each renderer once, and keeps the console clean', async ({
    page,
  }) => {
    const problems = collectConsoleProblems(page)
    await countRendererReleases(page)
    await page.goto('/')

    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    // First open, on the empty floor, then one wall: the frame that holds the wall is the proof of
    // what a drawn pane looks like for this project.
    await page.getByRole('button', { name: 'Split view' }).click()
    await waitForLiveCanvasReady(page)
    const emptyFloor = await settledLiveFrame(page)
    await drawWall(page, { from: { x: 100, y: 150 }, to: { x: 300, y: 150 } })
    await waitForLiveFrameDifferentFrom(
      page,
      emptyFloor,
      'the live 3D pane never drew the wall: its frame still matches the empty floor',
    )
    const wallFrame = await settledLiveFrame(page)
    expect(await rendererReleaseCount(page), 'nothing is released while the pane is open').toBe(0)
    const canvasesInSplitView = await page.locator('canvas').count()

    for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
      // Close: the plan view has no 3D pane, so the canvas unmounts.
      await page.getByRole('button', { name: 'Plan view' }).click()
      await expect(liveSceneCanvas(page)).toHaveCount(0)
      // The plan pane keeps its own canvas, so the page holds one canvas fewer than in split view.
      await expect(page.locator('canvas')).toHaveCount(canvasesInSplitView - 1)

      // Wait past the library's own teardown timer, then count the releases. The release is
      // asynchronous (it waits for the renderer's start to settle), so the count is read only
      // after the wait; one release for each close means exactly `cycle` so far.
      await page.waitForTimeout(TEARDOWN_WAIT_MS)
      expect(
        await rendererReleaseCount(page),
        `after close ${cycle} the renderer must have been released exactly once for each close so far`,
      ).toBe(cycle)

      // Open again: the pane must draw the same wall frame as the first open.
      await page.getByRole('button', { name: 'Split view' }).click()
      await waitForLiveCanvasReady(page)
      await waitForLiveFrameEqualTo(
        page,
        wallFrame,
        `open ${cycle + 1} of the live 3D pane never drew the frame the first open drew`,
      )
      expect(await rendererReleaseCount(page), 'an open pane has not released its renderer').toBe(
        cycle,
      )
    }

    // The last open stays open until here, so a message printed late by the app or the renderer
    // still lands in the list before it is read.
    await page.waitForTimeout(TEARDOWN_WAIT_MS)
    const unexpected = problems.filter(
      (problem) => !KNOWN_UNRELATED_MESSAGES.some((known) => known.test(problem)),
    )
    expect(unexpected, `console problems during the cycles:\n${problems.join('\n')}`).toEqual([])
  })
})
