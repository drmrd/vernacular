import { test, expect, type Locator, type Page } from '@playwright/test'
import { expectSameView, frameAfterChange, navButton } from './journeys/close-openings-support'
import { frameReader } from './frame-pixels'
import { LIVE_VIEW_READY } from './live-pane'
import {
  drawnRoomCanvas,
  drawnRoomWithDoorCanvas,
  logReading,
  settledSceneCanvas,
  stableFrame,
} from './scene-helpers'

// Exercises the live three-dimensional pane's named camera presets (the nav toolbar's
// Top down, elevations, and Doorway buttons). Runs only in the GPU `scene-webgl`
// Playwright project (the config routes `scene-*.spec.ts` there) and self-skips without
// WebGPU, because the live pane renders through the WebGPU backend and otherwise shows a
// fallback message.
//
// The assertion is semantic, not a committed pixel baseline: the live view renders through
// the non-deterministic WebGPU backend (ADR-0045 explains why a WebGPU pixel baseline is
// not pinned). Each test settles the canvas to a stable frame, clicks a preset, settles
// again, and requires the frame to change.
//
// The floor journeys compare two frames of one run, never a baseline. Two floors hold the
// same room and door, so the Doorway view of the other floor must equal the one of Ground.
//
// The look journeys pin which room the Doorway view looks into: the room the door serves, in
// every view scope and whatever else stands on the floor. Equal frames show the same view, and
// a flipped swing must show a different one.

interface PlanPoint {
  readonly x: number
  readonly y: number
}

// The five clicks of a closed rectangle: four corners, then back on the first to close the loop.
function rect(from: PlanPoint, to: PlanPoint): PlanPoint[] {
  return [from, { x: to.x, y: from.y }, to, { x: from.x, y: to.y }, from]
}

// The closed room and its door, in plan pixels.
const ROOM_CORNERS = rect({ x: 100, y: 120 }, { x: 300, y: 260 })
const DOOR_AT = { x: 200, y: 120 }

// A long building, an upper room at its east end with a door on the room's west wall, which
// faces the middle of the building.
const LONG_BUILDING = rect({ x: 40, y: 120 }, { x: 440, y: 260 })
const UPPER_ROOM = rect({ x: 320, y: 120 }, { x: 440, y: 260 })
const INNER_DOOR_AT = { x: 320, y: 190 }

// A house with a door on its east wall. The outbuilding stands east of it and takes the place
// of the upper room above.
const HOUSE = rect({ x: 40, y: 120 }, { x: 200, y: 260 })
const HOUSE_DOOR_AT = { x: 200, y: 190 }
const OUTBUILDING = UPPER_ROOM

// A partition across the long building makes two unequal rooms, with a door between them.
const PARTITION = [
  { x: 180, y: 120 },
  { x: 180, y: 260 },
]
const PARTITION_DOOR_AT = { x: 180, y: 190 }

// Two frames of a view that turned are far apart. The floor is a mean channel difference (0..255)
// well above the noise of two frames of one view, and well below what a turned view reads.
const DIFFERENT_VIEW_MEAN_FLOOR = 10
const READING_DIGITS = 3

// The floor buttons of the switcher. `exact` matters: "Ground" also matches "Underground levels".
function floorButton(page: Page, name: string): Locator {
  return page.getByRole('navigation', { name: 'Floors' }).getByRole('button', { name, exact: true })
}

// Opens the app on the plan with the 3D view beside it, and skips the test where the live pane
// has no WebGPU to render with.
async function startOnPlan(page: Page): Promise<void> {
  await page.goto('/')
  const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
  test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')
  await page.getByRole('button', { name: 'Split view' }).click()
}

// Shows every floor in the live view.
async function showWholeBuilding(page: Page): Promise<void> {
  const wholeBuilding = page.getByRole('button', { name: 'Whole building' })
  await wholeBuilding.click()
  await expect(wholeBuilding).toHaveAttribute('aria-pressed', 'true')
}

// Presses the inspector's Flip swing for the selected door, then waits for the view to settle.
async function flipSelectedSwing(page: Page, canvas: Locator): Promise<void> {
  const flip = page.getByRole('button', { name: 'Flip swing' })
  await expect(flip).toBeVisible()
  await flip.click()
  await stableFrame(canvas)
}

// Picks the wall tool, clicks the given points on the plan, and waits until the plan lists the
// given number of rooms.
async function drawWalls(page: Page, points: readonly PlanPoint[], rooms: number): Promise<void> {
  const plan = page.getByLabel('Floor plan')
  await expect(plan).toBeVisible()
  await page.getByRole('radio', { name: 'Wall', exact: true }).click()
  for (const position of points) await plan.click({ position })
  await expect(page.getByRole('option', { name: /^Room,/ })).toHaveCount(rooms)
}

// Picks the door tool, clicks once on a wall, and waits until the plan lists the given number of
// doors on the active floor.
async function placeDoor(page: Page, at: PlanPoint, doors: number): Promise<void> {
  await page.getByRole('radio', { name: 'Door', exact: true }).click()
  await page.getByLabel('Floor plan').click({ position: at })
  await expect(page.getByRole('option', { name: / wide$/ })).toHaveCount(doors)
}

// Picks the Select tool, which leaves the last placed door selected.
async function selectTool(page: Page): Promise<void> {
  await page.getByRole('radio', { name: 'Select', exact: true }).click()
}

// Picks the Select tool and clears the selection.
async function leaveTools(page: Page): Promise<void> {
  await selectTool(page)
  await page.keyboard.press('Escape')
}

// Draws the closed room and one door on the active floor, and waits until both are there.
async function drawRoomWithDoor(page: Page): Promise<void> {
  await drawWalls(page, ROOM_CORNERS, 1)
  await placeDoor(page, DOOR_AT, 1)
}

async function showFloor(page: Page, name: string): Promise<void> {
  await floorButton(page, name).click()
  await expect(floorButton(page, name)).toHaveAttribute('aria-pressed', 'true')
}

// The settled Doorway frame of the shown floor. The Top down step comes first so that the wait
// for a changed frame is safe: a Doorway frame may equal the frame before it, but never the
// top-down frame.
async function doorwayFrame(page: Page, canvas: Locator): Promise<Buffer> {
  const settled = await stableFrame(canvas)
  await navButton(page, 'Top down').click()
  const topDown = await frameAfterChange(canvas, settled)
  await navButton(page, 'Doorway').click()
  return frameAfterChange(canvas, topDown)
}

// Reads the two frames over the whole canvas, prints the reading, and expects them to differ.
async function expectDifferentView(
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
    `mean ${mean.toFixed(READING_DIGITS)} (floor ${DIFFERENT_VIEW_MEAN_FLOOR}), changed ${changedFraction.toFixed(READING_DIGITS)}`,
  )
  expect(mean, 'mean channel difference over the whole canvas').toBeGreaterThan(
    DIFFERENT_VIEW_MEAN_FLOOR,
  )
}

// Builds Ground and a second floor that hold the same room and door, shows Ground in the
// full-width 3D view, then returns the Doorway frame of Ground and the one of the other floor.
async function doorwayFramesOfTwoFloors(
  page: Page,
  other: { addButton: string; name: string },
): Promise<{ ground: Buffer; other: Buffer }> {
  await page.getByRole('button', { name: 'Split view' }).click()
  await drawRoomWithDoor(page)
  await page.getByRole('button', { name: other.addButton, exact: true }).click()
  await showFloor(page, other.name)
  await drawRoomWithDoor(page)
  await leaveTools(page)
  await showFloor(page, 'Ground')
  const canvas = await settledSceneCanvas(page)
  await expect(page.locator(LIVE_VIEW_READY)).toBeAttached()
  const ground = await doorwayFrame(page, canvas)
  await showFloor(page, other.name)
  return { ground, other: await doorwayFrame(page, canvas) }
}

test.describe('Live three-dimensional camera presets', () => {
  test('the top-down preset moves the live camera', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await drawnRoomCanvas(page)
    const before = await stableFrame(canvas)

    await page.getByRole('button', { name: 'Top down' }).click()

    const after = await stableFrame(canvas)
    expect(after.equals(before)).toBe(false)
  })

  test('the doorway preset frames the model from an opening', async ({ page }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const canvas = await drawnRoomWithDoorCanvas(page)
    await expect(page.getByRole('button', { name: 'Doorway' })).toBeEnabled()
    const before = await stableFrame(canvas)

    await page.getByRole('button', { name: 'Doorway' }).click()

    const after = await stableFrame(canvas)
    expect(after.equals(before)).toBe(false)
  })

  test('the doorway preset looks through the door of an upper floor as it does on the ground floor', async ({
    page,
  }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const frames = await doorwayFramesOfTwoFloors(page, {
      addButton: 'Add floor',
      name: '2nd Floor',
    })

    await expectSameView(page, 'doorway view of 2nd Floor against Ground', {
      first: frames.ground,
      second: frames.other,
    })
  })

  test('the doorway preset looks through the door of a basement as it does on the ground floor', async ({
    page,
  }) => {
    await page.goto('/')
    const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
    test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

    const frames = await doorwayFramesOfTwoFloors(page, {
      addButton: 'Add basement',
      name: 'Basement',
    })

    await expectSameView(page, 'doorway view of Basement against Ground', {
      first: frames.ground,
      second: frames.other,
    })
  })

  test('the doorway preset looks into the room from a door that faces the middle of the building in the whole-building view as in the floor view', async ({
    page,
  }) => {
    await startOnPlan(page)

    await drawWalls(page, LONG_BUILDING, 1)
    await page.getByRole('button', { name: 'Add floor', exact: true }).click()
    await showFloor(page, '2nd Floor')
    await drawWalls(page, UPPER_ROOM, 1)
    await placeDoor(page, INNER_DOOR_AT, 1)
    await leaveTools(page)
    const canvas = await settledSceneCanvas(page)
    await expect(page.locator(LIVE_VIEW_READY)).toBeAttached()
    const floorView = await doorwayFrame(page, canvas)
    await showWholeBuilding(page)
    const buildingView = await doorwayFrame(page, canvas)

    await expectSameView(
      page,
      'doorway view of the inner door, whole building against floor view',
      {
        first: floorView,
        second: buildingView,
      },
    )
  })

  test('the doorway preset looks into the house from a door that faces an outbuilding on the same floor', async ({
    page,
  }) => {
    await startOnPlan(page)

    await drawWalls(page, HOUSE, 1)
    await placeDoor(page, HOUSE_DOOR_AT, 1)
    await leaveTools(page)
    let canvas = await settledSceneCanvas(page)
    await expect(page.locator(LIVE_VIEW_READY)).toBeAttached()
    const alone = await doorwayFrame(page, canvas)
    await page.getByRole('button', { name: 'Split view' }).click()
    await drawWalls(page, OUTBUILDING, 2)
    await leaveTools(page)
    canvas = await settledSceneCanvas(page)
    const withOutbuilding = await doorwayFrame(page, canvas)

    await expectSameView(page, 'doorway view of the house door, with and without the outbuilding', {
      first: alone,
      second: withOutbuilding,
    })
  })

  test('the doorway preset turns into the other room when the swing of a door between two rooms is flipped', async ({
    page,
  }) => {
    await startOnPlan(page)

    await drawWalls(page, LONG_BUILDING, 1)
    await drawWalls(page, PARTITION, 2)
    await placeDoor(page, PARTITION_DOOR_AT, 1)
    await selectTool(page)
    const canvas = await settledSceneCanvas(page)
    await expect(page.locator(LIVE_VIEW_READY)).toBeAttached()
    const before = await doorwayFrame(page, canvas)
    await flipSelectedSwing(page, canvas)
    const after = await doorwayFrame(page, canvas)

    await expectDifferentView(
      page,
      'doorway view of the partition door, before against after Flip swing',
      {
        first: before,
        second: after,
      },
    )
  })
})
