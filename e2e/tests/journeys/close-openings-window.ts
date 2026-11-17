import { expect, type Locator, type Page } from '@playwright/test'
import { logReading, stableFrame } from '../scene-helpers'
import type { Region } from '../frame-pixels'
import { selectionStatusOf } from '../live-pane'
import { signatureDistance, startSampling, stopSampling, SHOWING_MARGIN } from '../region-sampler'
import {
  clearSelection,
  closeControl,
  enterWalkReady,
  frameAfterChange,
  openKeyChangesView,
  orbitSouthFrame,
} from './close-openings-support'
import {
  OPENING_REGION_MARGIN,
  closeWithControl,
  viewsOf,
  within,
  type Views,
} from './close-openings-views'
import { openDoorSeenFromOrbit, strafeUntilOpened } from './close-openings-flows'

// Steps for the hung window of the close-doors-and-windows journey: the box that its selection
// outline draws while it is shut, the frames of the window when it is open, and a second press of
// the open key at the pose that opened it.

// The window's name in the list of 3D entities: the first hung window in the room.
const WINDOW_NAME = 'Double Hung Window 1'
const SIDEWAYS_KEY = 'KeyA'
// How long the open window is watched, in milliseconds of animation time.
const READING_DIGITS = 3
const WATCH_MS = 400
// Fewer readings than this in the watch would say little about the frames in between.
const MIN_WATCHED_FRAMES = 5

function windowOption(page: Page): Locator {
  return page
    .getByRole('region', { name: /3d preview/i })
    .getByRole('option', { name: WINDOW_NAME, exact: true })
}

// The status line over the canvas names the selection, so it differs between the frames with
// and without the outline. The scene is what lies below it.
const STATUS_LINE_HEIGHT = 24

async function belowStatusLine(views: Views, frame: Buffer): Promise<Region> {
  const whole = await views.whole(frame)
  return { ...whole, y: STATUS_LINE_HEIGHT, h: whole.h - STATUS_LINE_HEIGHT }
}

// Selects the shut window through the list of 3D entities and returns the box of pixels that
// the selection outline changes. The selection is cleared again, and the view must be the
// unselected one again. The option is moved to with the keyboard, which is how the list is used
// when a person cannot point at the window.
export async function outlineOfShutWindow(
  page: Page,
  canvas: Locator,
  shut: Buffer,
): Promise<Region> {
  const views = viewsOf(page)
  await windowOption(page).focus()
  await page.keyboard.press('Enter')
  await expect(selectionStatusOf(page)).toHaveText(`Selected: ${WINDOW_NAME}`)
  const outlined = await frameAfterChange(canvas, shut)
  const scene = await belowStatusLine(views, shut)
  const box = await views.changedBox(shut, outlined, scene)
  const cleared = await clearSelection(page, canvas, outlined)
  const whole = await views.whole(shut)
  await views.expectSame(cleared, shut, within(whole, 'the view once the selection is cleared'))
  return box
}

// How far each side of a box lies outside another box, in pixels. A negative number is room to
// spare on that side.
function overhang(
  inner: Region,
  outer: Region,
): Record<'left' | 'top' | 'right' | 'bottom', number> {
  return {
    left: outer.x - inner.x,
    top: outer.y - inner.y,
    right: inner.x + inner.w - (outer.x + outer.w),
    bottom: inner.y + inner.h - (outer.y + outer.h),
  }
}

// Asserts that the box of changed pixels lies inside the outline box, give or take the margin on
// each side, and prints the boxes and the overhang of each side.
export function expectInside(
  changed: Region,
  outline: Region,
  limit: { margin: number; what: string },
): void {
  const sides = overhang(changed, outline)
  logReading(
    `inside, ${limit.what}`,
    `changed ${JSON.stringify(changed)}, outline ${JSON.stringify(outline)}, overhang ${JSON.stringify(sides)} (margin ${limit.margin})`,
  )
  for (const [side, pixels] of Object.entries(sides)) {
    expect(pixels, `${limit.what}: overhang past the ${side} of the outline`).toBeLessThanOrEqual(
      limit.margin,
    )
  }
}

// Opens the door and shuts it again to find where the door is, and then walks east to the window
// and opens it with the key. Returns the south view in orbit mode with nothing open, and the same
// view with the window open.
export async function openWindowSeenFromOrbit(
  page: Page,
  canvas: Locator,
): Promise<{ never: Buffer; open: Buffer }> {
  const door = await openDoorSeenFromOrbit(page, canvas)
  await closeWithControl(page, canvas, {
    frame: door.open,
    region: door.region,
    what: 'the door before the window opens',
  })
  await enterWalkReady(page, canvas)
  const open = await strafeUntilOpened(page, canvas, {
    key: SIDEWAYS_KEY,
    never: door.never,
    wanted: await viewsOf(page).eastOf(door.region, door.never),
    otherOpen: false,
  })
  return { never: door.never, open }
}

// Resolves after the page has drawn frames for the given time.
function afterMilliseconds(duration: number): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now()
    const tick = (): void => {
      if (performance.now() - start >= duration) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

// Reads the region of the open window on every frame for a short time, and again as a whole
// screenshot after it. The window does not move, so the sashes where they overlap must not
// change from frame to frame.
export async function expectWindowSteady(
  page: Page,
  canvas: Locator,
  open: { frame: Buffer; region: Region },
): Promise<void> {
  await startSampling(page, open.region)
  await page.evaluate(afterMilliseconds, WATCH_MS)
  const readings = await stopSampling(page)
  const [first] = readings
  if (first === undefined) throw new Error('the 3D canvas drew no frame to read')
  const drift = Math.max(...readings.map((reading) => signatureDistance(reading, first)))
  logReading(
    'steady, the open window',
    `${readings.length} frames, largest drift ${drift.toFixed(READING_DIGITS)} (limit ${SHOWING_MARGIN})`,
  )
  expect(readings.length, 'frames read of the open window').toBeGreaterThan(MIN_WATCHED_FRAMES)
  expect(drift, 'the open window from frame to frame').toBeLessThan(SHOWING_MARGIN)
  const later = await stableFrame(canvas)
  await viewsOf(page).expectSame(
    later,
    open.frame,
    within(open.region, 'the open window a moment later'),
  )
}

// Returns to the walker at the pose that opened the window and presses the open key a second
// time. Reports whether the view changed, and whether the control has nothing left to close.
export async function pressOpenKeyAgain(
  page: Page,
  canvas: Locator,
): Promise<{ changed: boolean; nothingLeft: boolean }> {
  await enterWalkReady(page, canvas)
  const changed = await openKeyChangesView(page, canvas)
  const nothingLeft = await closeControl(page).isDisabled()
  logReading(
    'open key again',
    `the view ${changed ? 'changed' : 'did not change'}, the control is ${nothingLeft ? 'disabled' : 'enabled'}`,
  )
  return { changed, nothingLeft }
}

// Scenario 9, the sashes of the hung window, on a room that nothing has opened yet.
export async function checkHungWindowSashes(page: Page, canvas: Locator): Promise<void> {
  const views = viewsOf(page)
  // The selection outline of the shut window is the box of its frame.
  const outline = await outlineOfShutWindow(page, canvas, await orbitSouthFrame(page, canvas))

  // Opened, nothing of the window appears outside that box. This does not show that only the
  // lower sash moves: the wall hides the parts above the head, so the check also passes when the
  // whole window rises. The unit tests in engine/scene/opening-motion.test.ts guard that.
  const { never, open } = await openWindowSeenFromOrbit(page, canvas)
  expectInside(await views.changedBox(never, open), outline, {
    margin: OPENING_REGION_MARGIN,
    what: 'the open window stays inside its frame',
  })

  // Standing open, the two sashes do not flicker where they overlap.
  const region = await views.openingRegion(never, open)
  await expectWindowSteady(page, canvas, { frame: open, region })

  // From the pose that opened it, the key reaches the open window again and shuts it.
  const again = await pressOpenKeyAgain(page, canvas)
  expect(again.changed, 'the second press of the open key changes the view').toBe(true)
  await expect(closeControl(page)).toBeDisabled()
  const shut = await orbitSouthFrame(page, canvas)
  await views.expectSame(shut, never, within(region, 'the window shut by the second key press'))
}
