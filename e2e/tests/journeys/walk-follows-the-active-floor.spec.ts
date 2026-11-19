import { test, expect, type Locator, type Page } from '@playwright/test'
import { frameReader } from '../frame-pixels'
import { configureGpuChromiumOnMac, guardLiveSceneSupport } from '../live-webgpu'
import { logReading, stableFrame } from '../scene-helpers'
import {
  enterOrbit,
  enterWalkReady,
  liveCanvas,
  settledLiveFrame,
  walkToDoor,
} from './close-openings-support'
import { gotoEditor, selectors } from './support'

// Issue #608: when the active floor changed during a walk, the walker's eye stayed at the height
// of the old floor, while the walls the walker collides with came from the new floor. This
// journey stands the walker at the shut door of the ground floor, makes the upper floor active,
// and compares the view. Both floors hold the same room and the same door, so a walker who stands
// on the upper floor at the same plan position and heading sees the same view as before. The
// journey then goes through an orbit detour and walks again, which resumes the saved pose on the
// upper floor, and compares once more.
//
// The live view renders through the non-deterministic WebGPU backend (ADR-0045), so this spec
// commits no pixel baseline. All frames are taken in the same run and compared with each other
// over the whole canvas. It needs a real WebGPU adapter and follows the same self-skip policy as
// the other live-view journeys: it skips without one, and E2E_REQUIRE_WEBGPU=1 turns the skip
// into a failure, which the macOS live-view job sets.

configureGpuChromiumOnMac()

// Two frames of one view are equal when the mean channel difference (0..255) stays below the
// first bar and the share of strongly changed pixels stays below the second.
const EQUAL_MEAN_LIMIT = 1.0
const EQUAL_CHANGED_FRACTION_LIMIT = 0.01

// The journey draws two rooms, walks to a door, and settles several frames, so its budget leaves
// a wide margin for a slower runner.
const TEST_TIMEOUT_MS = 120_000

// How long the view is given to draw the rebuilt upper floor before the journey takes the settled
// frame as it stands. A rebuild that leaves the walker's view as it was draws no change.
const REBUILD_DRAW_MS = 5_000

const READING_DIGITS = 3

const GROUND_FLOOR = 'Ground'
const UPPER_FLOOR = '2nd Floor'

// The same room and door as the other close-doors journeys, in plan pixels. The door stands at
// the middle of the north wall.
const ROOM_CORNERS = [
  { x: 40, y: 120 },
  { x: 440, y: 120 },
  { x: 440, y: 260 },
  { x: 40, y: 260 },
  { x: 40, y: 120 },
]
const DOOR_AT = { x: 240, y: 120 }

// Floor buttons are matched by their whole name: a plain match on "Ground" also finds the
// "Underground levels" button of the 3D toolbar.
function floorButton(page: Page, name: string): Locator {
  return page.getByRole('button', { name, exact: true })
}

// Draws a closed room with one door on the north wall, on the active floor.
async function drawRoomWithDoor(page: Page): Promise<void> {
  const plan = page.getByLabel('Floor plan')
  await expect(plan).toBeVisible()
  await page.getByRole('radio', { name: 'Wall', exact: true }).click()
  for (const position of ROOM_CORNERS) await plan.click({ position })
  await expect(selectors.roomProxies(page)).toHaveCount(1)
  await page.getByRole('radio', { name: 'Door', exact: true }).click()
  await plan.click({ position: DOOR_AT })
  await expect(page.getByRole('option', { name: / wide$/ })).toHaveCount(1)
}

// Makes a floor active and returns the settled frame once the scene shows it. The rebuilt scene
// draws a change when the view differs, and may draw nothing when the view stays the same, so the
// wait for a change is bounded and the settled frame is taken either way.
async function frameAfterFloorChange(
  page: Page,
  canvas: Locator,
  change: { floor: string; before: Buffer },
): Promise<Buffer> {
  await floorButton(page, change.floor).click()
  await expect
    .poll(async () => (await canvas.screenshot()).equals(change.before), {
      timeout: REBUILD_DRAW_MS,
    })
    .toBe(false)
    .catch(() => undefined)
  return stableFrame(canvas)
}

// Reads the two frames over the whole canvas, prints the reading, and expects them to be equal.
async function expectSameView(
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

test("keeps the walker's view when the upper floor becomes active mid-walk", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT_MS)
  await gotoEditor(page)
  await guardLiveSceneSupport(page, 'the walk-follows-the-active-floor journey')

  // Both floors hold the same room and the same door.
  await page.getByRole('button', { name: 'Split view' }).click()
  await drawRoomWithDoor(page)
  await selectors.addFloorButton(page).click()
  await floorButton(page, UPPER_FLOOR).click()
  await drawRoomWithDoor(page)

  // The ground floor is active again, with no tool and no selection, and the live view settled.
  await floorButton(page, GROUND_FLOOR).click()
  await page.getByRole('radio', { name: 'Select', exact: true }).click()
  await page.keyboard.press('Escape')
  const canvas = liveCanvas(page)
  await settledLiveFrame(page, canvas)

  // The walker stands at the shut door of the ground floor.
  const onGroundFloor = await walkToDoor(page, canvas)

  // The upper floor becomes active while the walk goes on. The walker keeps the plan position and
  // the heading and stands on the upper floor, so the view is the one it had.
  const onUpperFloor = await frameAfterFloorChange(page, canvas, {
    floor: UPPER_FLOOR,
    before: onGroundFloor,
  })
  await expectSameView(page, 'same, the walker at the door before and after the floor changes', {
    first: onGroundFloor,
    second: onUpperFloor,
  })

  // An orbit detour and a new walk resume the saved pose, which stands on the upper floor too.
  await enterOrbit(page)
  const resumed = await enterWalkReady(page, canvas)
  await expectSameView(page, 'same, the walker at the door before and after an orbit detour', {
    first: onGroundFloor,
    second: resumed,
  })
})
