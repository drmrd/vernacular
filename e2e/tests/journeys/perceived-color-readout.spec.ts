import {
  test,
  expect,
  type Locator,
  type Page,
  type PlaywrightWorkerOptions,
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
// scene-live-view.spec.ts and the WebGL 2 context probe in the scene harness specs. On the
// macOS live-view CI job and the development Mac the journey runs; on the linux runners it
// skips.

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
// since the render pipeline settled, so a click after it meets the framed room.
const LIVE_VIEW_READY = '[data-live-view-ready="true"]'

// The `chromium` project launches the stripped-down headless shell, which exposes
// navigator.gpu but refuses every adapter. On macOS this journey asks for the full Chromium
// build and the same GPU launch flags that the scene-webgl project uses on darwin (see
// SCENE_WEBGL_LAUNCH_ARGS in playwright.config.ts), which give the live pane a Metal-backed
// WebGPU adapter. Other browsers and other platforms keep their project defaults and fall
// through to the self-skip guard below.
const DARWIN_GPU_LAUNCH_ARGS = [
  '--enable-unsafe-webgpu',
  '--use-angle=metal',
  '--use-gpu-in-tests',
  '--ignore-gpu-blocklist',
]

function wantsGpuChromium(browserName: PlaywrightWorkerOptions['browserName']): boolean {
  return browserName === 'chromium' && process.platform === 'darwin'
}

type WorkerFixtureUse<T> = (value: T) => Promise<void>
type BrowserNameArg = Pick<PlaywrightWorkerOptions, 'browserName'>

async function gpuChannel(
  { browserName }: BrowserNameArg,
  provide: WorkerFixtureUse<PlaywrightWorkerOptions['channel']>,
): Promise<void> {
  await provide(wantsGpuChromium(browserName) ? 'chromium' : undefined)
}

async function gpuLaunchOptions(
  { browserName }: BrowserNameArg,
  provide: WorkerFixtureUse<PlaywrightWorkerOptions['launchOptions']>,
): Promise<void> {
  await provide(wantsGpuChromium(browserName) ? { args: DARWIN_GPU_LAUNCH_ARGS } : {})
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
  await skipWithoutLiveSceneSupport(page)

  const canvas = await drawnRoomCanvas(page)
  await expect(page.locator(LIVE_VIEW_READY)).toBeAttached()
  await expectClickToSelectOnByDefault(page)
  const inspector = inspectorOf(page)
  const chip = inspector.locator('[data-perceived]')

  // The first click names the face and samples it as it stands, unpainted.
  await clickTheFarWallInnerFace(page, canvas)
  const unpainted = await perceivedHexOf(chip)

  // Paint the face, let the painted frame settle, then click the face again, so the sample
  // that lands is taken from a frame that already shows the paint. Painting rebuilds the wall
  // meshes, and the near-wall fade marks the rebuilt near wall as see-through when the next
  // frame draws, so the settled frame is also the one in which the click passes through the
  // near wall, as it does for a person who sees the paint land before clicking again.
  await inspector.getByRole('button', { name: PAINT_NAME }).click()
  await stableFrame(canvas)
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
