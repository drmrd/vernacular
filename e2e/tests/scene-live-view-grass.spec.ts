import { test, expect, type Page } from '@playwright/test'
import { GROUND_GRASS_REFERENCE } from '../../core'
import { webFontsSettled } from './journeys/support'
import { waitForLiveViewReady } from './live-pane'
import { waitForLiveCanvasReady } from './live-pane-frames'
import { drawnSceneCanvas } from './scene-helpers'

// The live three-dimensional pane draws the ground with the mown-grass tile of the starter pack.
// Its ready marker (data-live-view-ready) waits for that tile, so a screenshot that waits on the
// marker never holds a lawn that is about to be textured. The marker must also not hold the pane
// back: the scene is drawn while the tile is still on its way, and a tile that never arrives
// leaves the flat lawn and still raises the marker.
//
// Each test holds or refuses the one request for the tile image with page.route. It first
// requires that the route saw the request, so a tile served from some cache cannot pass a test by
// accident. The page is not asked for the tile by anything but the live pane, so the request also
// proves that the pane asks for the grass.
//
// Like the neighbouring live-view specs, it runs in the scene-webgl project (the scene- name
// prefix routes it there) and self-skips in a browser with no navigator.gpu. Where the browser has
// no WebGPU adapter, three draws the pane through its WebGL 2 fallback, which the linux scene job
// exercises.

const GRASS_IMAGE_URL = new RegExp(
  `/packs/vernacular-starter-1\\.1\\.0/assets/${GROUND_GRASS_REFERENCE.contentHash}\\.png$`,
)

const MARKER_ATTRIBUTE = 'data-live-view-ready'

// How long the marker is watched while the grass is held. The marker has no event to wait for in
// this window, so the test looks for the change it must not make: this is how long it looks.
const HELD_MARKER_WATCH_MS = 1_000

interface GrassRequestControl {
  readonly requested: Promise<void>
  readonly release: () => void
}

// Holds the response for the grass image until release() runs. Must run before goto.
async function holdGrassResponse(page: Page): Promise<GrassRequestControl> {
  let release = (): void => {}
  let markRequested = (): void => {}
  const released = new Promise<void>((resolve) => (release = resolve))
  const requested = new Promise<void>((resolve) => (markRequested = resolve))
  await page.route(GRASS_IMAGE_URL, async (route) => {
    markRequested()
    await released
    await route.continue()
  })
  return { requested, release }
}

// Refuses the grass image, as an unreachable pack would. Must run before goto.
async function refuseGrassRequest(page: Page): Promise<{ readonly requested: Promise<void> }> {
  let markRequested = (): void => {}
  const requested = new Promise<void>((resolve) => (markRequested = resolve))
  await page.route(GRASS_IMAGE_URL, async (route) => {
    markRequested()
    await route.abort('failed')
  })
  return { requested }
}

async function openEditorWithGpu(page: Page): Promise<void> {
  await page.goto('/')
  await webFontsSettled(page)
  const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
  test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')
}

function liveViewMarker(page: Page) {
  return page.locator(`[${MARKER_ATTRIBUTE}]`)
}

test.describe('Live three-dimensional pane and the ground grass', () => {
  test('draws the scene while the grass is on its way and raises the marker once it arrives', async ({
    page,
  }) => {
    const grass = await holdGrassResponse(page)
    await openEditorWithGpu(page)

    await drawnSceneCanvas(page)
    await grass.requested
    // The scene is drawn, and the marker still waits: the overlay did not wait for the grass.
    await waitForLiveCanvasReady(page)
    await expect(liveViewMarker(page)).toHaveAttribute(MARKER_ATTRIBUTE, 'false')
    await page.waitForTimeout(HELD_MARKER_WATCH_MS)
    await expect(liveViewMarker(page)).not.toHaveAttribute(MARKER_ATTRIBUTE, 'true')

    grass.release()
    await waitForLiveViewReady(page)
  })

  test('raises the marker over the flat lawn when the grass cannot be fetched', async ({
    page,
  }) => {
    const refused = await refuseGrassRequest(page)
    await openEditorWithGpu(page)

    await drawnSceneCanvas(page)
    await refused.requested
    await waitForLiveViewReady(page)
  })
})
