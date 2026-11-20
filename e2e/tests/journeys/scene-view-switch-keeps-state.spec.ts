import { test, expect, type Page } from '@playwright/test'
import { webFontsSettled } from './support'
import {
  captureLiveFrame,
  liveSceneCanvas,
  settledLiveFrame,
  waitForLiveCanvasReady,
  waitForLiveFrameDifferentFrom,
} from '../live-pane-frames'
import { navButton } from './close-openings-support'

// Issue #621: the 3D preview's session state (camera mode, toolbar toggles, the camera pose, the
// walk pose) lives in a store that the bridge owns, so it outlives the preview subtree, which
// unmounts in the plan view and mounts again on the way back (ADR-0170). Each hook has unit
// tests, and the editor shell test runs in jsdom, where the pane shows its unsupported message and
// has no toolbar. These cases run the real pane and read what a person sees after the switch.
// They cover a flipped toolbar toggle with a dragged orbit camera, the walk pose across a detour
// into orbit mode and across the switch, and (issue #619) a panned orbit camera: after the switch
// the camera looks where it looked, and the first drag turns around the panned point.
//
// Like the neighbouring live-view specs this one reads what the renderer drew and not a marker:
// canvas-only captures, which must differ from the earlier frames (so that the later equality
// means something) and must be steady. Nothing in the page exposes the camera or the walk pose as
// a value, so a frame is the reading for both. After each mount of the pane the cases wait for the
// readiness marker of that mount before they capture or read the toolbar (live-pane-frames.ts
// says why).
//
// The file name starts with "scene-" so that the configuration routes it to the scene-webgl
// project and keeps it out of the chromium project. Like the neighbours the cases self-skip only
// without navigator.gpu. In CI only the linux job runs this file, and there the pane draws through
// three's WebGL 2 fallback (navigator.gpu is present and requestAdapter resolves to null). The
// macOS job runs named specs only and does not run it. The WebGPU path runs only where someone
// runs the scene-webgl project on a development Mac, which has a real adapter.

// How long the restored view may take to show the kept frame. It shows it within a few frames, so
// the bound is generous margin, not a measured wait.
const FRAME_TIMEOUT_MS = 10_000

// A walk key held this long moves the walker a clear distance. The distance depends on the frame
// rate, which is fine: the cases compare the pose before and after the switch, not a distance. The
// scene-navigation spec holds the key for the same time and also has no event to wait for.
const WALK_HOLD_MS = 600

// The orbit drag: from the canvas centre by this many CSS pixels, in this many mouse moves.
const DRAG_DX = 120
const DRAG_DY = 40
const DRAG_STEPS = 8

// The pan: a secondary-button drag from the canvas centre by this many CSS pixels, in the same
// number of mouse moves. The orbit controls move the camera and the point it turns around by the
// same offset, so a pan is the one drag that moves the pivot.
const PAN_DX = 90
const PAN_DY = 50

// A closed rectangular room in plan pixels (the last corner is the first again, which closes the
// loop), drawn in the split view.
const ROOM_CORNERS = [
  { x: 100, y: 120 },
  { x: 300, y: 120 },
  { x: 300, y: 260 },
  { x: 100, y: 260 },
  { x: 100, y: 120 },
]

// A frame with the name that the failure message uses for it.
interface NamedFrame {
  readonly name: string
  readonly frame: Buffer
}

// The settled frame after a change that was just requested. A change may not have drawn yet, and
// two equal captures taken before it draws would also look settled, so the first wait is for a
// frame that differs from the one before.
async function settledFrameAfterChange(
  page: Page,
  before: NamedFrame,
  change: string,
): Promise<Buffer> {
  await waitForLiveFrameDifferentFrom(
    page,
    before.frame,
    `${change} never changed the live 3D frame: it still matches ${before.name}`,
  )
  return settledLiveFrame(page)
}

// Plan view, where the 3D pane unmounts, then back to the split view, where it mounts again, and
// the wait for the start-up of that new mount to end.
async function leaveAndReturn(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Plan view' }).click()
  await expect(liveSceneCanvas(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Split view' }).click()
  await waitForLiveCanvasReady(page)
}

// Drags from the canvas centre by the given offset with the given mouse button, then parks the
// pointer away from the canvas, so no hover highlight sits on the frame that follows.
async function dragFromCanvasCentre(
  page: Page,
  button: 'left' | 'right',
  offset: { dx: number; dy: number },
): Promise<void> {
  const box = await liveSceneCanvas(page).locator('canvas').boundingBox()
  if (box === null) throw new Error('the 3D canvas has no bounding box')
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  await page.mouse.move(centerX, centerY)
  await page.mouse.down({ button })
  await page.mouse.move(centerX + offset.dx, centerY + offset.dy, { steps: DRAG_STEPS })
  await page.mouse.up({ button })
  await page.mouse.move(0, 0)
}

// Drags the orbit camera with the primary button.
async function dragOrbitCamera(page: Page): Promise<void> {
  await dragFromCanvasCentre(page, 'left', { dx: DRAG_DX, dy: DRAG_DY })
}

// The orbit drag the other way round, which turns the camera back to where it was.
async function dragOrbitCameraBack(page: Page): Promise<void> {
  await dragFromCanvasCentre(page, 'left', { dx: -DRAG_DX, dy: -DRAG_DY })
}

// Pans the camera with the secondary button, which moves the orbit pivot with the camera.
async function panOrbitCamera(page: Page): Promise<void> {
  await dragFromCanvasCentre(page, 'right', { dx: PAN_DX, dy: PAN_DY })
}

// Waits until the pane shows the kept frame and holds it. When it never does, the failure names
// which earlier frame the pane shows instead, which says what the switch lost.
async function expectKeptFrame(
  page: Page,
  kept: NamedFrame,
  earlier: readonly NamedFrame[],
): Promise<void> {
  const nameOfShownFrame = async (): Promise<string> => {
    const shown = await captureLiveFrame(page)
    return (
      [kept, ...earlier].find((known) => known.frame.equals(shown))?.name ??
      'a frame that matches none of the frames taken before'
    )
  }
  await expect.poll(nameOfShownFrame, { timeout: FRAME_TIMEOUT_MS }).toBe(kept.name)
  // A match in passing is not enough: the restored view must stay on the kept frame.
  expect(
    (await settledLiveFrame(page)).equals(kept.frame),
    `the pane showed ${kept.name} and then moved on`,
  ).toBe(true)
}

// Opens the split view on the empty floor, draws a closed room, and returns the settled frame of
// the room. That frame differs from the empty floor, so the pane has drawn the room.
async function openDrawnRoom(page: Page): Promise<NamedFrame> {
  await page.goto('/')
  await webFontsSettled(page)
  const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
  test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

  await page.getByRole('button', { name: 'Split view' }).click()
  await waitForLiveCanvasReady(page)
  const empty = { name: 'the empty floor', frame: await settledLiveFrame(page) }

  const plan = page.getByLabel('Floor plan')
  await expect(plan).toBeVisible()
  await page.getByRole('radio', { name: 'Wall', exact: true }).click()
  for (const position of ROOM_CORNERS) await plan.click({ position })
  await expect(page.getByRole('option', { name: /^Room,/ })).toHaveCount(1)
  // Leave the wall tool and clear the selection, so no highlight sits on the room.
  await page.getByRole('radio', { name: 'Select', exact: true }).click()
  await page.keyboard.press('Escape')
  const room = await settledFrameAfterChange(page, empty, 'drawing the room')
  return { name: 'the orbit view of the room', frame: room }
}

// Enters walk mode, where the camera drops to eye height, and walks forward a fixed time. Returns
// the frames of the start pose and of the pose after the walk, which differ from each other and
// from the orbit view of the room.
async function walkForward(
  page: Page,
  orbitRoom: NamedFrame,
): Promise<{ standing: NamedFrame; walked: NamedFrame }> {
  await navButton(page, 'Walk').click()
  await expect(navButton(page, 'Walk')).toHaveAttribute('aria-pressed', 'true')
  const standing = {
    name: 'the walker at its start pose',
    frame: await settledFrameAfterChange(page, orbitRoom, 'entering walk mode'),
  }
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(WALK_HOLD_MS)
  await page.keyboard.up('KeyW')
  const walked = {
    name: 'the walker after walking forward',
    frame: await settledFrameAfterChange(page, standing, 'holding the walk key'),
  }
  return { standing, walked }
}

test.describe('Live three-dimensional pane across a view switch', () => {
  test('keeps a flipped toolbar toggle and a moved orbit camera after the plan view', async ({
    page,
  }) => {
    const defaultCamera = await openDrawnRoom(page)

    // Flip the edge overlay away from its default. The toggle shows its state in the DOM, and the
    // overlay changes the frame, so a lost toggle shows in both readings.
    const edges = navButton(page, 'Surface edges')
    await expect(edges).toHaveAttribute('aria-pressed', 'false')
    await edges.click()
    await expect(edges).toHaveAttribute('aria-pressed', 'true')
    const withEdges = {
      name: 'the default camera with the edge overlay on',
      frame: await settledFrameAfterChange(page, defaultCamera, 'the edge overlay toggle'),
    }

    // Drag the orbit camera. The drag changes the frame, so the kept frame holds the camera pose.
    await dragOrbitCamera(page)
    const dragged = {
      name: 'the dragged camera with the edge overlay on',
      frame: await settledFrameAfterChange(page, withEdges, 'the orbit drag'),
    }

    await leaveAndReturn(page)

    // The toggle reading is soft and comes first, so a switch that loses both states reports both.
    await expect
      .soft(edges, 'the Surface edges toggle was reset by the view switch')
      .toHaveAttribute('aria-pressed', 'true')
    await expectKeptFrame(page, dragged, [defaultCamera, withEdges])
  })

  test('keeps the walk position across a detour into orbit mode', async ({ page }) => {
    const orbitRoom = await openDrawnRoom(page)
    const { standing, walked } = await walkForward(page, orbitRoom)

    await navButton(page, 'Orbit').click()
    await expect(navButton(page, 'Orbit')).toHaveAttribute('aria-pressed', 'true')
    const orbitEntered = {
      name: 'the orbit view at the start of the detour',
      frame: await settledFrameAfterChange(page, walked, 'entering orbit mode'),
    }
    // Move the orbit camera away during the detour. Without the drag the orbit camera would still
    // sit where the walker stood, and a walk that started again from the live camera would match
    // the kept pose, so the case could not tell a saved pose from a reseeded one.
    await dragOrbitCamera(page)
    const orbitMoved = {
      name: 'the orbit view moved away during the detour',
      frame: await settledFrameAfterChange(page, orbitEntered, 'the orbit drag'),
    }
    await navButton(page, 'Walk').click()
    await expect(navButton(page, 'Walk')).toHaveAttribute('aria-pressed', 'true')
    await expectKeptFrame(page, walked, [standing, orbitEntered, orbitMoved, orbitRoom])
  })

  test('keeps the walk position and the walk mode after the plan view', async ({ page }) => {
    const orbitRoom = await openDrawnRoom(page)
    const { standing, walked } = await walkForward(page, orbitRoom)

    await leaveAndReturn(page)

    // The camera mode must come back as walk too, and the walker must stand where it stopped.
    await expect
      .soft(navButton(page, 'Walk'), 'the camera mode was reset by the view switch')
      .toHaveAttribute('aria-pressed', 'true')
    await expectKeptFrame(page, walked, [standing, orbitRoom])
  })

  test('keeps a panned orbit camera and turns the first drag around the panned point after the plan view', async ({
    page,
  }) => {
    test.slow()
    const room = await openDrawnRoom(page)

    // Pan the camera. The pan moves the camera and the point it turns around together, so the
    // panned frame differs from the framed view of the room.
    await panOrbitCamera(page)
    const panned = {
      name: 'the panned camera',
      frame: await settledFrameAfterChange(page, room, 'the pan'),
    }

    // Turn the camera and turn it back. The turn around the panned point differs from the panned
    // frame, and the way back returns to the panned frame exactly, which is the reading that the
    // second turn after the switch is compared with.
    await dragOrbitCamera(page)
    const turned = {
      name: 'the panned camera turned around the panned point',
      frame: await settledFrameAfterChange(page, panned, 'the orbit drag'),
    }
    await dragOrbitCameraBack(page)
    await expectKeptFrame(page, panned, [room, turned])

    await leaveAndReturn(page)

    // The camera must stand where it stood and look where it looked, which is the panned frame.
    await expectKeptFrame(page, panned, [room, turned])

    // The first drag after the switch must turn around the panned point, not around the framed
    // centre of the model, so it gives the frame that the same drag gave before the switch.
    await dragOrbitCamera(page)
    await expectKeptFrame(page, turned, [panned, room])
  })
})
