import { test, expect, type Locator, type Page } from '@playwright/test'

// Issue #733: the live three-dimensional pane shows a drawn wall, also when the scene view
// renders again while the renderer chunk loads and while the renderer initializes. The two
// holds exist because those are the two windows in which a repeated render could once leave the
// pane blank: the canvas must not be configured twice before its renderer exists, or the second
// configuration would build a renderer and camera that never receive a size.
//
// The renderer factory is synchronous. The canvas wrapper waits for the lazily loaded three.js
// WebGPU module before it builds a renderer, and that module carries both the WebGPU backend and
// three's own WebGL 2 fallback. Holding that chunk's response holds the start-up open on either
// backend, with no product change and no fixed sleep: the test decides
// when the start-up may finish. The first test presses a scene toolbar toggle twice inside
// that window; the second test holds the same window and presses nothing, which proves that
// the held start-up alone is harmless.
//
// The assertion reads only what the renderer drew. Overlays sit on top of the canvas (the
// guidance shown over an empty floor, the selection readout and the controls hint), and the
// empty-floor guidance disappears when a wall is drawn, so a capture that kept them would
// change even over a blank pane. Each capture therefore hides every element except the canvas.
// A blank pane never changes, so a bounded poll for a changed frame cannot pass on it; a pane
// that draws the wall changes, so the poll cannot fail on a correct one.
//
// The first two tests hold the chunk window: the scene view renders against a placeholder
// there, and the drawn wall must still appear once the chunk loads. The third test holds the
// initialization window, where the canvas has mounted and the renderer's own init() is pending.
// It slows init() by holding navigator.gpu.requestAdapter, which both the WebGPU backend and
// three's WebGL 2 fallback path call first, until the test lets it through.
//
// Like the neighbouring live-view specs, it runs in the scene-webgl project (the scene- name
// prefix routes it there) and self-skips without navigator.gpu. The holds are written for the
// WebGPU path, and the adapter hold needs navigator.gpu. A browser without it still mounts a
// canvas, which three draws through its WebGL 2 fallback; it does not get a fallback message.

const RENDERER_CHUNK = /\/assets\/three\.webgpu-[^/]+\.js$/

// The session provider raises this once a frame has been drawn (ADR-0170). It is raised on a
// blank pane too, so it only marks the end of the start-up and says nothing about the content.
const LIVE_VIEW_READY = '[data-live-view-ready="true"]'

// React Three Fiber mounts the canvas at the HTML default (~150px) height, then resizes it to
// the real pane box; a settled canvas is past that default.
const SETTLED_CANVAS_MIN_HEIGHT = 200

// How long a drawn wall may take to appear in the live pane. The wall reaches the pane within a
// few frames once it is committed, so the bound is generous margin, not a measured wait.
const WALL_APPEARS_TIMEOUT_MS = 10_000

// Applied only for the duration of one screenshot. Visibility is inherited but can be restored
// on a descendant, so the canvas stays visible while every other element is hidden.
const CANVAS_ONLY_STYLE =
  'body * { visibility: hidden !important; } canvas { visibility: visible !important; }'

type Point = { x: number; y: number }

interface HeldRendererStartUp {
  // Resolves once the page has asked for the renderer chunk, so the start-up window is open.
  requested: Promise<void>
  // Lets the held request through, so the renderer start-up can finish.
  release: () => void | Promise<void>
}

// Holds every response for the renderer chunk until release() is called.
async function holdRendererStartUp(page: Page): Promise<HeldRendererStartUp> {
  let release = (): void => {}
  let markRequested = (): void => {}
  const released = new Promise<void>((resolve) => (release = resolve))
  const requested = new Promise<void>((resolve) => (markRequested = resolve))
  await page.route(RENDERER_CHUNK, async (route) => {
    markRequested()
    await released
    await route.continue()
  })
  return { requested, release }
}

interface AdapterRequestWindow {
  adapterRequested?: boolean
  releaseAdapterRequests?: () => void
}

// Delays every navigator.gpu.requestAdapter call until releaseAdapterRequests() runs in the
// page, which holds renderer.init() open after the canvas has mounted. Must run before goto.
async function holdAdapterRequests(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const gpu = (
      navigator as unknown as {
        gpu?: { requestAdapter: (...args: unknown[]) => Promise<unknown> }
      }
    ).gpu
    if (gpu === undefined) return
    const pageWindow = window as unknown as AdapterRequestWindow
    const original = gpu.requestAdapter.bind(gpu)
    const released = new Promise<void>((resolve) => {
      pageWindow.releaseAdapterRequests = resolve
    })
    gpu.requestAdapter = async (...args) => {
      pageWindow.adapterRequested = true
      await released
      return original(...args)
    }
  })
}

// The start-up window of an already armed hold: open once the page has asked for an adapter,
// which only the mounted canvas's renderer does, and closed by release().
function heldAdapterRequests(page: Page): HeldRendererStartUp {
  return {
    requested: page
      .waitForFunction(() => (window as unknown as AdapterRequestWindow).adapterRequested === true)
      .then(() => undefined),
    release: () =>
      page.evaluate(() => (window as unknown as AdapterRequestWindow).releaseAdapterRequests?.()),
  }
}

// The pixels the renderer drew, without the overlays above the canvas.
async function drawnPixels(canvas: Locator): Promise<Buffer> {
  return canvas.screenshot({ style: CANVAS_ONLY_STYLE })
}

// Polls until two consecutive canvas-only captures match, then returns that settled frame.
async function settledDrawnPixels(canvas: Locator): Promise<Buffer> {
  let last = await drawnPixels(canvas)
  await expect
    .poll(
      async () => {
        const next = await drawnPixels(canvas)
        const steady = next.equals(last)
        last = next
        return steady
      },
      { message: 'waiting for the live 3D canvas to reach a stable frame' },
    )
    .toBe(true)
  return last
}

// Presses the Reveal interior toggle twice. Each press changes scene-view state, so the scene
// view renders again; the second press restores the default, so the drawn scene is unchanged.
async function renderSceneViewTwice(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Reveal interior' })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
}

// Opens the split view while the renderer start-up is held, runs duringStartUp inside that
// window, lets the start-up finish, and returns the live canvas once it is settled.
async function openSplitViewDuringHeldStartUp(
  page: Page,
  startUp: HeldRendererStartUp,
  duringStartUp: () => Promise<void>,
): Promise<Locator> {
  await page.getByRole('button', { name: 'Split view' }).click()
  const pane = page.getByRole('region', { name: /3d preview/i })
  const canvas = pane.locator('canvas')
  await expect(canvas).toHaveCount(1)
  await startUp.requested

  await duringStartUp()
  await startUp.release()

  await expect(page.locator(LIVE_VIEW_READY)).toBeAttached()
  await expect
    .poll(async () => (await canvas.boundingBox())?.height ?? 0, {
      message: 'waiting for the live 3D canvas to settle past its default size',
    })
    .toBeGreaterThan(SETTLED_CANVAS_MIN_HEIGHT)
  return canvas
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

// Draws one wall and requires the live pane's drawn pixels to leave the empty-floor frame.
async function expectDrawnWallInLivePane(page: Page, canvas: Locator): Promise<void> {
  const emptyFloor = await settledDrawnPixels(canvas)

  await drawWall(page, { from: { x: 100, y: 150 }, to: { x: 300, y: 150 } })

  await expect
    .poll(async () => (await drawnPixels(canvas)).equals(emptyFloor), {
      message: 'the live 3D pane never drew the wall: its frame still matches the empty floor',
      timeout: WALL_APPEARS_TIMEOUT_MS,
    })
    .toBe(false)
}

test.describe('Live three-dimensional pane during renderer start-up', () => {
  test('shows a drawn wall when the scene view renders again during renderer start-up', async ({
    page,
  }) => {
    const startUp = await holdRendererStartUp(page)
    await page.goto('/')

    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await openSplitViewDuringHeldStartUp(page, startUp, () =>
      renderSceneViewTwice(page),
    )
    await expectDrawnWallInLivePane(page, canvas)
  })

  test('shows a drawn wall after a slow renderer start-up with no render in between', async ({
    page,
  }) => {
    const startUp = await holdRendererStartUp(page)
    await page.goto('/')

    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await openSplitViewDuringHeldStartUp(page, startUp, async () => {})
    await expectDrawnWallInLivePane(page, canvas)
  })

  test('shows a drawn wall when the scene view renders again while the renderer initializes', async ({
    page,
  }) => {
    await holdAdapterRequests(page)
    await page.goto('/')

    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await openSplitViewDuringHeldStartUp(page, heldAdapterRequests(page), () =>
      renderSceneViewTwice(page),
    )
    await expectDrawnWallInLivePane(page, canvas)
  })
})

test.describe('Live three-dimensional pane after a failed renderer load', () => {
  // Chromium 148 kept the failure of a dynamic import for the life of the page: an in-place retry
  // of the same module never reached the network. A reloaded page asks for the chunk again, which
  // the wrapper's unit tests cannot show because they replace the loader.
  test('shows the live canvas after Reload page once the renderer chunk can be fetched again', async ({
    page,
  }) => {
    const chunkRequests: string[] = []
    page.on('request', (request) => {
      if (RENDERER_CHUNK.test(request.url())) chunkRequests.push(request.url())
    })
    await page.route(RENDERER_CHUNK, (route) => route.abort('failed'))
    await page.goto('/')

    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    await page.getByRole('button', { name: 'Split view' }).click()
    const pane = page.getByRole('region', { name: /3d preview/i })
    await expect(pane.getByRole('alert')).toHaveText(
      'Could not load the 3D view. Check your network connection, then reload the page.',
    )
    await expect(pane.locator('canvas')).toHaveCount(0)
    const requestsBeforeReload = chunkRequests.length
    expect(requestsBeforeReload).toBeGreaterThan(0)

    await page.unroute(RENDERER_CHUNK)
    await Promise.all([
      page.waitForEvent('load'),
      pane.getByRole('button', { name: 'Reload page' }).click(),
    ])

    await page.getByRole('button', { name: 'Split view' }).click()
    await expect(page.locator(LIVE_VIEW_READY)).toBeAttached()
    await expect(pane.getByRole('alert')).toHaveCount(0)
    const canvas = pane.locator('canvas')
    await expect(canvas).toHaveCount(1)
    await expect
      .poll(async () => (await canvas.boundingBox())?.height ?? 0, {
        message: 'waiting for the live 3D canvas to settle past its default size',
      })
      .toBeGreaterThan(SETTLED_CANVAS_MIN_HEIGHT)
    expect(chunkRequests.length).toBeGreaterThan(requestsBeforeReload)
  })
})
