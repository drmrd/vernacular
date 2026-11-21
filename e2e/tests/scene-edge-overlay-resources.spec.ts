import { test, expect, type Locator } from '@playwright/test'
import { webFontsSettled } from './journeys/support'
import { navButton } from './journeys/close-openings-support'
import { LIVE_VIEW_READY } from './live-pane'
import { drawnRoomCanvas, logReading } from './scene-helpers'

// Issue #434: flipping the surface-edge overlay rebuilds the scene, and the superseded build's
// GPU resources must be freed. This spec runs the real live pane and reads the renderer's own
// counts of live geometries and textures, which a test-only probe (RendererMemoryProbe, gated
// by the `?e2e` runtime flag) writes onto the live canvas each frame. Ten flips of the overlay
// must leave both counts no higher than the first reading, so a build that leaked what each
// flip retired would climb with every flip.
//
// renderer.info does not count materials, so a leaked material cannot show here; the unit
// tests of the release path cover those.
//
// Runs only in the GPU `scene-webgl` Playwright project (the config routes `scene-*.spec.ts`
// there) and self-skips without navigator.gpu, as the neighbouring live-view specs do.

const FLIPS = 10
// A reading is settled when two reads this far apart agree; a frame draws well within it.
const SETTLE_INTERVAL_MS = 250
const READING_TIMEOUT_MS = 15_000
// The disposal of a retired scene happens after the commit that attaches the new one, so the
// final counts get this long to fall back to the first reading.
const RELEASE_TIMEOUT_MS = 10_000
const TEST_TIMEOUT_MS = 90_000

interface Reading {
  geometries: number
  textures: number
}

async function readCounts(canvas: Locator): Promise<Reading | null> {
  const [geometries, textures] = await Promise.all([
    canvas.getAttribute('data-renderer-geometries'),
    canvas.getAttribute('data-renderer-textures'),
  ])
  if (geometries === null || textures === null) return null
  return { geometries: Number(geometries), textures: Number(textures) }
}

// Polls until two reads one interval apart agree, then returns that reading. A read taken before
// the first frame carries no attributes and is not accepted.
async function settledReading(canvas: Locator, label: string): Promise<Reading> {
  let reading: Reading | null = null
  await expect
    .poll(
      async () => {
        const before = await readCounts(canvas)
        await canvas.page().waitForTimeout(SETTLE_INTERVAL_MS)
        const after = await readCounts(canvas)
        reading = after
        return before !== null && after !== null && JSON.stringify(before) === JSON.stringify(after)
      },
      {
        message: `waiting for the renderer counts to settle (${label})`,
        timeout: READING_TIMEOUT_MS,
      },
    )
    .toBe(true)
  if (reading === null) throw new Error(`no renderer counts were read (${label})`)
  const settled: Reading = reading
  logReading(label, `geometries ${settled.geometries}, textures ${settled.textures}`)
  return settled
}

test('ten flips of the surface-edge overlay keep the renderer geometry and texture counts flat', async ({
  page,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS)
  await page.goto('/?e2e=1')
  await webFontsSettled(page)
  const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
  test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

  // A closed room gives the overlay real wall and floor edges to build and retire.
  const canvas = await drawnRoomCanvas(page)
  await expect(page.locator(LIVE_VIEW_READY)).toBeAttached()
  const first = await settledReading(canvas, 'first reading, overlay off')

  const edges = navButton(page, 'Surface edges')
  for (let flip = 1; flip <= FLIPS; flip += 1) {
    const overlayOn = flip % 2 === 1
    await edges.click()
    await expect(edges).toHaveAttribute('aria-pressed', overlayOn ? 'true' : 'false')
    const reading = await settledReading(
      canvas,
      `flip ${flip}, overlay ${overlayOn ? 'on' : 'off'}`,
    )
    // The edge lines are geometry, so the probe must see the overlay add some; otherwise the
    // final comparison could pass without the probe counting anything the overlay builds.
    if (flip === 1) expect(reading.geometries).toBeGreaterThan(first.geometries)
  }

  // The tenth flip leaves the overlay off, the state of the first reading. No slack: every
  // geometry and texture the overlay built must have been freed.
  await expect
    .poll(async () => (await readCounts(canvas))?.geometries ?? Number.POSITIVE_INFINITY, {
      message: 'geometries after ten flips',
      timeout: RELEASE_TIMEOUT_MS,
    })
    .toBeLessThanOrEqual(first.geometries)
  await expect
    .poll(async () => (await readCounts(canvas))?.textures ?? Number.POSITIVE_INFINITY, {
      message: 'textures after ten flips',
      timeout: RELEASE_TIMEOUT_MS,
    })
    .toBeLessThanOrEqual(first.textures)
})
