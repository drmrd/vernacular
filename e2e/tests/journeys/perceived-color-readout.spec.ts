import {
  test,
  expect,
  type FullProject,
  type Locator,
  type Page,
  type PlaywrightWorkerOptions,
  type WorkerFixture,
  type WorkerInfo,
} from '@playwright/test'
import { gotoEditor } from './support'
import { drawnRoomCanvas, stableFrame } from '../scene-helpers'

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

// The live pane raises this once the stored session has been applied and a frame has drawn
// since the last render-pipeline build settled. It follows the render pipeline only, not the
// meshes the drawn room derives, so the journey also waits for a stable frame before it clicks.
const LIVE_VIEW_READY = '[data-live-view-ready="true"]'

// Set where the journey must run rather than skip: the guard below then fails when the runner
// lacks a WebGPU adapter or a WebGL 2 context.
const LIVE_SCENE_REQUIRED = process.env.E2E_REQUIRE_WEBGPU === '1'

// The `chromium` project launches the stripped-down headless shell, which exposes
// navigator.gpu but refuses every adapter. On macOS this journey takes the browser channel and
// the launch options of the scene-webgl project from the loaded Playwright configuration, which
// give the live pane a Metal-backed WebGPU adapter, so the two cannot drift apart. Other
// browsers and other platforms keep their own project settings and fall through to the guard.
const GPU_PROJECT = 'scene-webgl'

type BrowserName = PlaywrightWorkerOptions['browserName']

function wantsGpuChromium(browserName: BrowserName): boolean {
  return browserName === 'chromium' && process.platform === 'darwin'
}

function workerUse(browserName: BrowserName, workerInfo: WorkerInfo): FullProject['use'] {
  if (!wantsGpuChromium(browserName)) return workerInfo.project.use
  const gpuProject = workerInfo.config.projects.find((project) => project.name === GPU_PROJECT)
  if (gpuProject === undefined) {
    throw new Error(`the Playwright configuration has no ${GPU_PROJECT} project to borrow from`)
  }
  return gpuProject.use
}

// Playwright reads a fixture's dependencies from the destructured first argument, so each
// fixture names browserName there.
const gpuChannel: WorkerFixture<
  PlaywrightWorkerOptions['channel'],
  PlaywrightWorkerOptions
> = async ({ browserName }, provide, workerInfo) => {
  await provide(workerUse(browserName, workerInfo).channel)
}

const gpuLaunchOptions: WorkerFixture<
  PlaywrightWorkerOptions['launchOptions'],
  PlaywrightWorkerOptions
> = async ({ browserName }, provide, workerInfo) => {
  await provide(workerUse(browserName, workerInfo).launchOptions ?? {})
}

test.use({
  channel: [gpuChannel, { scope: 'worker' }],
  launchOptions: [gpuLaunchOptions, { scope: 'worker' }],
})

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
async function guardLiveSceneSupport(page: Page): Promise<void> {
  const support = await page.evaluate(async () => {
    const probe = document.createElement('canvas')
    const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown | null> } }).gpu
    const adapter = gpu === undefined ? null : await gpu.requestAdapter().catch(() => null)
    return { webGpuAdapter: adapter !== null, webGl2: probe.getContext('webgl2') !== null }
  })
  if (LIVE_SCENE_REQUIRED) {
    expect(
      support,
      'E2E_REQUIRE_WEBGPU is set, so this runner must provide a WebGPU adapter and a WebGL 2 context',
    ).toEqual({ webGpuAdapter: true, webGl2: true })
  }
  test.skip(
    !support.webGpuAdapter,
    'The live 3D preview requires a working WebGPU adapter; the perceived-color readout self-skips without one.',
  )
  test.skip(
    !support.webGl2,
    'No WebGL 2 context on this runner; the perceived-color readout self-skips here.',
  )
}

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
// proves the paint landed on that face. The frame must then change before it settles: two
// equal screenshots taken before the rebuilt meshes draw would also look stable.
async function paintAndAwaitPaintedFrame(inspector: Locator, canvas: Locator): Promise<void> {
  const finishChoices = inspector.getByRole('group', { name: 'Finish', exact: true })
  await expect(finishChoices).toHaveCount(0)
  const unpaintedFrame = await stableFrame(canvas)
  await inspector.getByRole('button', { name: PAINT_NAME }).click()
  await expect(finishChoices).toBeVisible()
  await expect
    .poll(async () => (await canvas.screenshot()).equals(unpaintedFrame), {
      message: 'waiting for the live 3D canvas to draw the painted face',
    })
    .toBe(false)
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
  await guardLiveSceneSupport(page)

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
  // around a product defect (issue ISSUE-click-after-paint): a click before the first frame
  // after a paint can pick the faded near wall, and the readout then shows the far wall's
  // pixel under the near wall's name. The mechanism is inferred, not proven: painting rebuilds
  // the wall meshes, and the rebuilt near wall is most likely marked as faded only when the
  // next frame draws.
  await paintAndAwaitPaintedFrame(inspector, canvas)
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
