import { expect, type Locator, type Page } from '@playwright/test'
import { frameReader } from '../frame-pixels'
import { logReading, settledSceneCanvas, stableFrame } from '../scene-helpers'
import { inspectorOf, selectionStatusOf, waitForLiveViewReady } from '../live-pane'

// Steps shared by the close-doors-and-windows journeys: a room with a door and a window, the
// 3D toolbar, and walking the camera to an opening.

const CONTROL_NAME = 'Close doors and windows'
const WALK_KEY = 'KeyW'
const OPEN_KEY = 'KeyE'
const RESET_KEY = 'KeyR'

// The room is a rectangle in plan pixels, wide enough that a door and a window both sit on its
// north wall with room to walk between them. The door stands at the middle of the wall and the
// window to the east of it.
const ROOM_CORNERS = [
  { x: 40, y: 120 },
  { x: 440, y: 120 },
  { x: 440, y: 260 },
  { x: 40, y: 260 },
  { x: 40, y: 120 },
]
const DOOR_AT = { x: 240, y: 120 }
const WINDOW_AT = { x: 400, y: 120 }

// A key tap long enough for the walk controller to see it.
const TAP_MS = 60
// Walking the length of the room to the north wall takes several seconds on the real adapter.
const WALK_TIMEOUT_MS = 30_000
// How long a key press that should change nothing is held before the frame is read again.
const HOLD_MS = 1_500

export function closeControl(page: Page): Locator {
  return page.getByRole('button', { name: CONTROL_NAME })
}

export function navButton(page: Page, name: string): Locator {
  return page
    .getByRole('toolbar', { name: '3D navigation' })
    .getByRole('button', { name, exact: true })
}

export function liveCanvas(page: Page): Locator {
  return page.getByRole('region', { name: /3d preview/i }).locator('canvas')
}

// Draws the closed room in the plan view, where the plan stage has the whole viewport, then puts
// a door and a window on the north wall and opens the split view.
export async function drawRoomWithOpenings(page: Page): Promise<void> {
  const plan = page.getByLabel('Floor plan')
  await expect(plan).toBeVisible()
  await page.getByRole('radio', { name: 'Wall', exact: true }).click()
  for (const position of ROOM_CORNERS) await plan.click({ position })
  await expect(page.getByRole('option', { name: /^Room,/ })).toHaveCount(1)
  await page.getByRole('radio', { name: 'Door', exact: true }).click()
  await plan.click({ position: DOOR_AT })
  await page.getByRole('radio', { name: 'Window', exact: true }).click()
  await plan.click({ position: WINDOW_AT })
  await expect(page.getByRole('option', { name: / wide$/ })).toHaveCount(2)
  await page.getByRole('button', { name: 'Split view' }).click()
}

// Waits for the pane to raise its ready marker, then returns the canvas's settled frame. The
// canvas has already reached its pane size, which settledSceneCanvas waits for.
export async function settledLiveFrame(page: Page, canvas: Locator): Promise<Buffer> {
  await waitForLiveViewReady(page)
  return stableFrame(canvas)
}

// Builds the room, opens the full-width 3D view, and returns its settled canvas. The placement
// tool is left and the selection cleared, so no highlight outline sits on an opening.
export async function openRoomIn3d(page: Page): Promise<Locator> {
  await drawRoomWithOpenings(page)
  const canvas = await settledSceneCanvas(page)
  await settledLiveFrame(page, canvas)
  await page.getByRole('radio', { name: 'Select', exact: true }).click()
  await page.keyboard.press('Escape')
  return canvas
}

// The first settled frame that differs from the given one. A change that was just requested
// (a door swinging, a camera switching) may not have drawn yet, and two equal screenshots taken
// before it draws would also look settled.
export async function frameAfterChange(canvas: Locator, before: Buffer): Promise<Buffer> {
  await expect
    .poll(async () => (await canvas.screenshot()).equals(before), {
      message: 'waiting for the live 3D canvas to draw a change',
    })
    .toBe(false)
  return stableFrame(canvas)
}

export async function enterOrbit(page: Page): Promise<void> {
  await navButton(page, 'Orbit').click()
  await expect(navButton(page, 'Orbit')).toHaveAttribute('aria-pressed', 'true')
}

export async function enterWalk(page: Page): Promise<void> {
  await navButton(page, 'Walk').click()
  await expect(navButton(page, 'Walk')).toHaveAttribute('aria-pressed', 'true')
}

// Enters walk mode and waits until the walker's view has replaced the orbit frame, which is when
// the walk keys can be used. The Walk button shows as pressed before that: the walk controller
// attaches its key listeners in an effect, and the frame is drawn from the walker's camera only
// after the switch has committed. Returns the walker's settled frame.
export async function enterWalkReady(page: Page, canvas: Locator): Promise<Buffer> {
  const orbit = await stableFrame(canvas)
  await enterWalk(page)
  return frameAfterChange(canvas, orbit)
}

// Orbit mode looking at the north wall from the south, settled.
export async function orbitSouthFrame(page: Page, canvas: Locator): Promise<Buffer> {
  await enterOrbit(page)
  await navButton(page, 'South').click()
  return stableFrame(canvas)
}

// Taps the walk key until the frame moves, which shows the walk key listeners are attached,
// then returns the frame the walker stands in.
async function standingWalker(page: Page, canvas: Locator): Promise<Buffer> {
  const first = await stableFrame(canvas)
  await expect
    .poll(
      async () => {
        await page.keyboard.press(WALK_KEY, { delay: TAP_MS })
        return (await canvas.screenshot()).equals(first)
      },
      { message: 'waiting for the walk keys to move the walker' },
    )
    .toBe(false)
  return stableFrame(canvas)
}

// Holds the walk key until the walker has moved and then stopped, which is where it meets a
// shut door. Returns the frame the walker stops in.
async function holdWalkUntilStopped(page: Page, canvas: Locator): Promise<Buffer> {
  const start = await stableFrame(canvas)
  let last = start
  let moved = false
  await page.keyboard.down(WALK_KEY)
  try {
    await expect
      .poll(
        async () => {
          const next = await canvas.screenshot()
          moved = moved || !next.equals(start)
          const stopped = moved && next.equals(last)
          last = next
          return stopped
        },
        { timeout: WALK_TIMEOUT_MS, message: 'waiting for the walker to stop at the north wall' },
      )
      .toBe(true)
  } finally {
    await page.keyboard.up(WALK_KEY)
  }
  return stableFrame(canvas)
}

// Looks at the north wall from the north, starts walking, and walks up to the door. Returns the
// walker's settled frame at the shut door.
export async function walkToDoor(page: Page, canvas: Locator): Promise<Buffer> {
  await navButton(page, 'North').click()
  await stableFrame(canvas)
  await enterWalkReady(page, canvas)
  await standingWalker(page, canvas)
  return holdWalkUntilStopped(page, canvas)
}

// Presses the open key at a shut door and returns the walker's settled frame once it is open.
export async function openWithKey(page: Page, canvas: Locator, shut: Buffer): Promise<Buffer> {
  await page.keyboard.press(OPEN_KEY)
  await expect(closeControl(page)).toBeEnabled()
  return frameAfterChange(canvas, shut)
}

// Presses the open key a second time, from the pose that opened the door, and returns the settled
// frame once the door has shut again.
export async function closeWithKey(page: Page, canvas: Locator, open: Buffer): Promise<Buffer> {
  await page.keyboard.press(OPEN_KEY)
  await expect(closeControl(page)).toBeDisabled()
  return frameAfterChange(canvas, open)
}

// Presses the reset key and returns the settled frame once the openings are shut again.
export async function resetWithKey(page: Page, canvas: Locator, open: Buffer): Promise<Buffer> {
  await page.keyboard.press(RESET_KEY)
  await expect(closeControl(page)).toBeDisabled()
  return frameAfterChange(canvas, open)
}

// Holds the walk key for a while and returns the settled frame, to see whether the walker moved.
export async function holdWalkKey(page: Page, canvas: Locator): Promise<Buffer> {
  await page.keyboard.down(WALK_KEY)
  await page.waitForTimeout(HOLD_MS)
  await page.keyboard.up(WALK_KEY)
  return stableFrame(canvas)
}

// Switches the surface-edge overlay, which rebuilds the scene, and returns the settled frame
// after the rebuild draws.
export async function toggleEdges(page: Page, canvas: Locator, before: Buffer): Promise<Buffer> {
  await navButton(page, 'Surface edges').click()
  return frameAfterChange(canvas, before)
}

const PAINT_NAME = 'Sage Green'

// Looks straight down and clicks the middle of the canvas, which strikes the floor of the room,
// and waits until the floor is the selection. Returns the settled frame with the south view.
export async function selectFloor(page: Page, canvas: Locator): Promise<Buffer> {
  await navButton(page, 'Top down').click()
  await stableFrame(canvas)
  const box = await canvas.boundingBox()
  if (box === null) throw new Error('the 3D canvas has no bounding box')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(selectionStatusOf(page)).toHaveText(/^Selected: /)
  await navButton(page, 'South').click()
  return stableFrame(canvas)
}

// Paints the selected surface and waits until the inspector shows the finish choices, which it
// offers only for a surface that carries a solid paint, so the paint has landed.
export async function paintSelection(page: Page): Promise<void> {
  await inspectorOf(page).getByRole('button', { name: PAINT_NAME }).click()
  await expect(inspectorOf(page).getByRole('group', { name: 'Finish', exact: true })).toBeVisible()
}

// Clears the selection and returns the settled frame once its outline is gone.
export async function clearSelection(page: Page, canvas: Locator, before: Buffer): Promise<Buffer> {
  await page.keyboard.press('Escape')
  await expect(selectionStatusOf(page)).toHaveText('No entity selected')
  return frameAfterChange(canvas, before)
}

// How long a press of the open key is given to change the view before it counts as a miss.
const KEY_EFFECT_MS = 600

// Holds a sideways key for a while, which moves the walker by an amount that depends on the
// frame rate.
export async function strafe(page: Page, key: string, durationMs: number): Promise<void> {
  await page.keyboard.down(key)
  await page.waitForTimeout(durationMs)
  await page.keyboard.up(key)
}

// Presses the open key and reports whether the view changed within a short time: something
// within reach swung. A miss is the answer false, not an error.
export async function openKeyChangesView(page: Page, canvas: Locator): Promise<boolean> {
  const before = await stableFrame(canvas)
  await page.keyboard.press(OPEN_KEY)
  const deadline = Date.now() + KEY_EFFECT_MS
  while (Date.now() < deadline) {
    if (!(await canvas.screenshot()).equals(before)) {
      await stableFrame(canvas)
      return true
    }
  }
  return false
}

// Two frames of one view are equal when the mean channel difference (0..255) stays below the
// first bar and the share of strongly changed pixels stays below the second.
const EQUAL_MEAN_LIMIT = 1.0
const EQUAL_CHANGED_FRACTION_LIMIT = 0.01

const READING_DIGITS = 3

// Reads the two frames over the whole canvas, prints the reading, and expects them to be equal.
export async function expectSameView(
  page: Page,
  label: string,
  frames: { first: Buffer; second: Buffer },
): Promise<void> {
  const reader = frameReader(page)
  const { mean, changedFraction } = await reader.difference(
    frames.first,
    frames.second,
    await reader.whole(frames.first),
  )
  logReading(
    label,
    `mean ${mean.toFixed(READING_DIGITS)} (limit ${EQUAL_MEAN_LIMIT}), changed ${changedFraction.toFixed(READING_DIGITS)} (limit ${EQUAL_CHANGED_FRACTION_LIMIT})`,
  )
  expect(mean, 'mean channel difference over the whole canvas').toBeLessThan(EQUAL_MEAN_LIMIT)
  expect(changedFraction, 'fraction of changed pixels over the whole canvas').toBeLessThan(
    EQUAL_CHANGED_FRACTION_LIMIT,
  )
}
