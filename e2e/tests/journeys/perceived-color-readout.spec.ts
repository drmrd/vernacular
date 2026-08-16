import { test, expect, type Locator, type Page } from '@playwright/test'
import { gotoEditor } from './support'
import { drawnRoomCanvas } from '../scene-helpers'

// The perceived-color readout answers the question a person picking paint actually has: what
// does this color look like on the surface, under this light (ADR-0164). Each layer of that
// path carries unit coverage against fakes, and the canvas pixel reader in particular was once
// dead in the live app because nothing ever ran it against a real drawing buffer. This journey
// closes that gap. It paints a floor, clicks that floor in the live 3D pane, and reads the
// sampled color back out of the inspector, so the engine-to-bridge-to-editor seam is exercised
// end to end against a real rendered frame.
//
// The assertions are DOM semantics only and this spec commits no pixel baseline. The live pane
// renders through the non-deterministic WebGPU backend (ADR-0045), so the sampled hex is
// whatever that frame happened to hold; what must hold is that a hex arrives at all, in a shape
// a person can read.
//
// Self-skip policy: the live pane is gated on WebGPU and shows an unsupported-browser message
// otherwise (issue #476), and the sample is read out of a real 3D drawing buffer. A runner
// missing either capability skips rather than fails, following the WebGPU guard in
// scene-live-view.spec.ts and the WebGL 2 context probe in the scene harness specs.

// A CSS hex color in the form the readout writes: '#' followed by six hex digits.
const PERCEIVED_HEX = /^#[0-9a-f]{6}$/i
// Every perceived-shift phrase opens the same way ("Reads as painted", "Reads lighter and
// warmer"), so this matches the phrase without pinning which shift the render produced.
const SHIFT_PHRASE = /^Reads /i
// The bundled palette color assigned to the floor before it is sampled.
const PAINT_NAME = 'Sage Green'

function inspectorOf(page: Page): Locator {
  return page.getByRole('complementary', { name: /inspector/i })
}

// The 3D pane holds two status-role nodes (the color-temperature readout and the selection
// live region), so scope to the selection one by its vocabulary, as scene-selection.spec.ts does.
function selectionStatusOf(page: Page): Locator {
  return page
    .getByRole('region', { name: /3d preview/i })
    .getByRole('status')
    .filter({ hasText: /No entity selected|^Selected: / })
}

// The live pane renders only where WebGPU exists, and the readout samples a real 3D drawing
// buffer, so both capabilities gate this journey. Presence of navigator.gpu is not enough:
// headless builds can expose the API while refusing every adapter, which mounts a pane that
// never renders a frame, so the guard asks for a real adapter.
async function skipWithoutLiveSceneSupport(page: Page): Promise<void> {
  const support = await page.evaluate(async () => {
    const probe = document.createElement('canvas')
    const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown | null> } }).gpu
    const adapter = gpu === undefined ? null : await gpu.requestAdapter().catch(() => null)
    return { webGpuAdapter: adapter !== null, webGl2: probe.getContext('webgl2') !== null }
  })
  test.skip(
    !support.webGpuAdapter,
    'The live 3D preview requires a working WebGPU adapter; the perceived-color readout self-skips without one.',
  )
  test.skip(
    !support.webGl2,
    'No WebGL 2 context on this runner; the perceived-color readout self-skips here.',
  )
}

// Click-to-select in the 3D pane is a user toggle that is off by default, and the
// perceived-color request rides the very click that commits the selection.
async function enableClickToSelect(page: Page): Promise<void> {
  const toggle = page
    .getByRole('region', { name: /3d preview/i })
    .getByRole('button', { name: /select/i })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
}

// Clicks the centre of the settled canvas, where the closed room's floor slab fills the framed
// view, and waits for the selection the click commits so the sample request is known to be out.
async function clickTheFloorInTheScene(page: Page, canvas: Locator): Promise<void> {
  const box = await canvas.boundingBox()
  if (box === null) throw new Error('the 3D canvas has no bounding box')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(selectionStatusOf(page)).toHaveText(/^Selected: /)
}

test('shows the perceived color of a painted surface clicked in the live 3D view', async ({
  page,
}) => {
  await gotoEditor(page)
  await skipWithoutLiveSceneSupport(page)

  const canvas = await drawnRoomCanvas(page)
  await enableClickToSelect(page)
  const inspector = inspectorOf(page)

  // Select the floor by clicking it, paint it, then click it again, so the sample that lands
  // is taken from a frame that already shows the paint.
  await clickTheFloorInTheScene(page, canvas)
  await expect(inspector.getByRole('group', { name: 'Room surface' })).toBeVisible()
  await inspector.getByRole('button', { name: PAINT_NAME }).click()
  await clickTheFloorInTheScene(page, canvas)

  // The sample is read a frame after the click, so this web-first assertion retries until the
  // readout appears rather than waiting out a fixed delay.
  const chip = inspector.locator('[data-perceived]')
  await expect(chip).toBeVisible()

  const perceived = await chip.getAttribute('data-perceived')
  if (perceived === null) throw new Error('the perceived-color chip carries no data-perceived hex')
  expect(perceived).toMatch(PERCEIVED_HEX)

  // The sampled hex is readable on screen rather than hiding in an attribute, it is captioned
  // for what it is, and the shift from the assigned paint is described in plain language.
  await expect(chip).toHaveText(perceived)
  await expect(inspector.getByText('Under this light')).toBeVisible()
  await expect(inspector.getByText(SHIFT_PHRASE)).toBeVisible()
})
