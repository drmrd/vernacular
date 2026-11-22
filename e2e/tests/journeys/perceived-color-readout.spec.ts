import { test, expect, type Locator, type Page } from '@playwright/test'
import { gotoEditor } from './support'
import { waitForDrawnSceneChange } from '../live-pane-frames'
import { drawnRoomCanvas, stableFrame } from '../scene-helpers'
import { LIVE_VIEW_READY, inspectorOf, selectionStatusOf } from '../live-pane'
import { guardLiveSceneSupport, configureGpuChromiumOnMac } from '../live-webgpu'

// The perceived-color readout answers the question a person picking paint actually has: what
// does this color look like on the surface, under this light (ADR-0164). Each layer of that
// path carries unit coverage against fakes, and the canvas pixel reader in particular was once
// dead in the live app because nothing ever ran it against a real drawing buffer. This journey
// closes that gap. It clicks a wall face in the live 3D pane, paints it, clicks it again, and
// reads the sampled color back out of the inspector next to the name of the surface it belongs
// to, so the engine-to-bridge-to-editor seam is exercised end to end against a real frame.
//
// The assertions are DOM semantics only and this spec commits no pixel baseline. The live pane
// renders through the non-deterministic WebGPU backend (ADR-0045), so the sampled hex is
// whatever that frame happened to hold; what must hold is that a hex arrives for the surface
// that was clicked, in a shape a person can read.
//
// Self-skip policy: the live pane is gated on WebGPU and shows an unsupported-browser message
// otherwise (issue #476), and the sample is read out of a real 3D drawing buffer. A runner
// missing either capability skips rather than fails, following the WebGPU guard in
// scene-live-view.spec.ts and the WebGL 2 context probe in the scene harness specs, so the
// journey skips on the linux runners. Where it must run, E2E_REQUIRE_WEBGPU=1 turns that skip
// into a failure. The macOS live-view CI job sets it, so a runner image that loses its adapter
// fails the job instead of passing it with a silent skip.

// A CSS hex color in the form the readout writes: '#' followed by six hex digits.
const PERCEIVED_HEX = /^#[0-9a-f]{6}$/i
// Every perceived-shift phrase opens the same way ("Reads as painted", "Reads lighter and
// warmer"), so this matches the phrase without pinning which shift the render produced.
const SHIFT_PHRASE = /^Reads /i
// The bundled palette color assigned to the clicked face before it is sampled again.
const PAINT_NAME = 'Sage Green'

// The surface the click at the canvas centre must reach. The room helper draws the top edge of
// the plan first, so that wall is "Wall 1", and the default view frames it as the far wall.
// The near wall stands between the camera and the centre ray but is faded for the view, and a
// click passes through a faded wall, so the ray lands on the far wall's inner face. That face
// is the right-hand side of the wall's drawing direction, which the inspector labels "B".
const FAR_WALL = 'Wall 1'
const INNER_FACE = 'B'

configureGpuChromiumOnMac()

// Click-to-select is on by default, and the perceived-color request rides the very click
// that commits the selection, so the journey relies on the default rather than setting it.
async function expectClickToSelectOnByDefault(page: Page): Promise<void> {
  const toggle = page
    .getByRole('region', { name: /3d preview/i })
    .getByRole('button', { name: /select/i })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
}

// Clicks the centre of the settled canvas and waits until the inspector names the surface the
// click picked: the far wall is selected and its inner face is the active face. The sample
// request goes out on the same click, so once the name is shown the request is out too.
async function clickTheFarWallInnerFace(page: Page, canvas: Locator): Promise<void> {
  const box = await canvas.boundingBox()
  if (box === null) throw new Error('the 3D canvas has no bounding box')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(selectionStatusOf(page)).toHaveText(`Selected: ${FAR_WALL}`)
  const faceSwitch = inspectorOf(page).getByRole('group', { name: 'Wall face' })
  await expect(faceSwitch.getByRole('button', { name: INNER_FACE })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
}

// Paints the active face and waits for a settled frame that shows the paint. The inspector
// offers the finish choices only for a face that carries a solid paint, so their arrival
// proves the paint landed on that face. A paint gives a new framed scene, so the pane must then
// draw a later scene revision before the frame settles: two equal screenshots taken before the
// rebuilt meshes draw would also look stable.
async function paintAndAwaitPaintedFrame(
  page: Page,
  inspector: Locator,
  canvas: Locator,
): Promise<void> {
  const finishChoices = inspector.getByRole('group', { name: 'Finish', exact: true })
  await expect(finishChoices).toHaveCount(0)
  await waitForDrawnSceneChange(page, async () => {
    await inspector.getByRole('button', { name: PAINT_NAME }).click()
    await expect(finishChoices).toBeVisible()
  })
  await stableFrame(canvas)
}

// The hex the readout chip shows, once the chip is on screen and its text matches its data.
async function perceivedHexOf(chip: Locator): Promise<string> {
  await expect(chip).toHaveAttribute('data-perceived', PERCEIVED_HEX)
  const perceived = await chip.getAttribute('data-perceived')
  if (perceived === null) throw new Error('the perceived-color chip carries no data-perceived hex')
  await expect(chip).toHaveText(perceived)
  return perceived
}

test('shows the perceived color of a painted surface clicked in the live 3D view', async ({
  page,
}) => {
  await gotoEditor(page)
  await guardLiveSceneSupport(page, 'the perceived-color readout')

  const canvas = await drawnRoomCanvas(page)
  await expect(page.locator(LIVE_VIEW_READY)).toBeAttached()
  await stableFrame(canvas)
  await expectClickToSelectOnByDefault(page)
  const inspector = inspectorOf(page)
  const chip = inspector.locator('[data-perceived]')

  // The first click names the face and samples it as it stands, unpainted.
  await clickTheFarWallInnerFace(page, canvas)
  const unpainted = await perceivedHexOf(chip)

  // Paint the face, wait for the painted frame, then click the face again. The wait works
  // around a product defect (issue #776): a click before the first frame
  // after a paint can pick the faded near wall, and the readout then shows the far wall's
  // pixel under the near wall's name. The mechanism is inferred, not proven: painting rebuilds
  // the wall meshes, and the rebuilt near wall is most likely marked as faded only when the
  // next frame draws.
  await paintAndAwaitPaintedFrame(page, inspector, canvas)
  await clickTheFarWallInnerFace(page, canvas)

  // The readout is read a frame after the click, so this web-first assertion retries until
  // the new sample replaces the unpainted one, with no fixed delay.
  await expect(chip).not.toHaveAttribute('data-perceived', unpainted)
  await perceivedHexOf(chip)

  // The sampled hex is captioned for what it is, and the shift from the assigned paint is
  // described in plain language.
  await expect(inspector.getByText('Under this light')).toBeVisible()
  await expect(inspector.getByText(SHIFT_PHRASE)).toBeVisible()
})
