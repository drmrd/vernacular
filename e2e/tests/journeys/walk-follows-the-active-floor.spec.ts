import { test, expect, type Locator, type Page } from '@playwright/test'
import { configureGpuChromiumOnMac, guardLiveSceneSupport } from '../live-webgpu'
import {
  closeControl,
  enterOrbit,
  enterWalkReady,
  expectSameView,
  liveCanvas,
  openKeyChangesView,
  resetWithKey,
  settledLiveFrame,
  walkToDoor,
} from './close-openings-support'
import { gotoEditor, selectors } from './support'

// Issue #608: when the active floor changed during a walk, the walker's eye stayed at the height
// of the old floor, while the walls the walker collides with came from the new floor. This
// journey stands the walker at the shut door of the ground floor, makes the upper floor active,
// and compares the view. Both floors hold the same room and the same door, so a walker who stands
// on the upper floor at the same plan position and heading sees the same view as before. The
// journey then presses the open key at the door of the upper floor: the door has to swing in
// sight, which shows that the walker reaches the doors of the floor that the walker stands on. It
// shuts the door again, goes through an orbit detour, and walks again, which resumes the saved
// pose on the upper floor, and compares once more. A second test starts the first walk on the
// upper floor and presses the open key there.
//
// The live view renders through the non-deterministic WebGPU backend (ADR-0045), so this spec
// commits no pixel baseline. All frames are taken in the same run and compared with each other
// over the whole canvas. It needs a real WebGPU adapter and follows the same self-skip policy as
// the other live-view journeys: it skips without one, and E2E_REQUIRE_WEBGPU=1 turns the skip
// into a failure, which the macOS live-view job sets.

configureGpuChromiumOnMac()

// The journey draws two rooms, walks to a door, and settles several frames, so its budget leaves
// a wide margin for a slower runner.
const TEST_TIMEOUT_MS = 120_000

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

// Makes a floor active and returns the settled frame once the scene shows it. The wait does not
// look at the picture, because the picture may stay as it was when the walker follows the floor.
// It waits for the state: the floors bar shows this floor, and only this one, as the pressed
// button. That is the store's active floor after the click has been applied. Two animation frames
// then pass, so the live view has run a frame step of the walker with that floor, and the settled
// frame is taken after the ready marker of the pane.
async function frameAfterFloorChange(page: Page, canvas: Locator, floor: string): Promise<Buffer> {
  await floorButton(page, floor).click()
  await expect(
    page.getByRole('group', { name: 'Floors', exact: true }).getByRole('button', { pressed: true }),
  ).toHaveText(floor)
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  )
  return settledLiveFrame(page, canvas)
}

// Presses the open key at the door in front of the walker and expects the door to swing in sight
// and the control that closes doors and windows to be enabled. Returns the settled frame with the
// door open.
async function expectDoorOpensInSight(page: Page, canvas: Locator): Promise<Buffer> {
  expect(
    await openKeyChangesView(page, canvas),
    'the open key changes the view: the door swings in sight',
  ).toBe(true)
  await expect(closeControl(page)).toBeEnabled()
  return settledLiveFrame(page, canvas)
}

test("keeps the walker's view and reach when the upper floor becomes active mid-walk", async ({
  page,
}) => {
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
  const onUpperFloor = await frameAfterFloorChange(page, canvas, UPPER_FLOOR)
  await expectSameView(page, 'same, the walker at the door before and after the floor changes', {
    first: onGroundFloor,
    second: onUpperFloor,
  })

  // The open key reaches the door of the upper floor. The door has to open in sight, for two
  // reasons. The walker reaches the doors of the floor the walker stands on. And the frame above
  // equals the frame before the switch, so a frame taken before the pane drew the upper floor
  // would pass that check for a wrong reason: a door that opens in sight proves that the picture
  // shows the floor on which the key acts.
  const doorOpen = await expectDoorOpensInSight(page, canvas)

  // The door is shut again, so that the comparison after the detour is between two views of a
  // shut door, as the comparison above.
  const shutAgain = await resetWithKey(page, canvas, doorOpen)
  // This frame follows two changes of the view that the test saw (the door opened, the door shut),
  // so it cannot be a frame from before the floor switch. It compares the walker's height on the
  // upper floor with the ground floor view directly.
  await expectSameView(page, 'same, the walker at the shut door after E and R on the upper floor', {
    first: onGroundFloor,
    second: shutAgain,
  })

  // An orbit detour and a new walk resume the saved pose, which stands on the upper floor too.
  await enterOrbit(page)
  const resumed = await enterWalkReady(page, canvas)
  await expectSameView(page, 'same, the walker at the door before and after an orbit detour', {
    first: onGroundFloor,
    second: resumed,
  })
})

test('opens the door of the upper floor with the open key on a walk that starts there', async ({
  page,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS)
  await gotoEditor(page)
  await guardLiveSceneSupport(page, 'the walk-follows-the-active-floor journey')

  // Only the upper floor holds a room with a door, and it is the active floor when the walk starts.
  await page.getByRole('button', { name: 'Split view' }).click()
  await selectors.addFloorButton(page).click()
  await floorButton(page, UPPER_FLOOR).click()
  await drawRoomWithDoor(page)
  await page.getByRole('radio', { name: 'Select', exact: true }).click()
  await page.keyboard.press('Escape')
  const canvas = liveCanvas(page)
  await settledLiveFrame(page, canvas)

  await walkToDoor(page, canvas)
  await expectDoorOpensInSight(page, canvas)
})
