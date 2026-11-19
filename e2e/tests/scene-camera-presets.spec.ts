import { test, expect, type Locator, type Page } from '@playwright/test'
import { expectSameView, frameAfterChange, navButton } from './journeys/close-openings-support'
import { LIVE_VIEW_READY } from './live-pane'
import {
  drawnRoomCanvas,
  drawnRoomWithDoorCanvas,
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

// The closed room and its door, in plan pixels.
const ROOM_CORNERS = [
  { x: 100, y: 120 },
  { x: 300, y: 120 },
  { x: 300, y: 260 },
  { x: 100, y: 260 },
  { x: 100, y: 120 },
]
const DOOR_AT = { x: 200, y: 120 }

// The floor buttons of the switcher. `exact` matters: "Ground" also matches "Underground levels".
function floorButton(page: Page, name: string): Locator {
  return page.getByRole('navigation', { name: 'Floors' }).getByRole('button', { name, exact: true })
}

// Draws the closed room and one door on the active floor, and waits until both are there.
async function drawRoomWithDoor(page: Page): Promise<void> {
  const plan = page.getByLabel('Floor plan')
  await expect(plan).toBeVisible()
  await page.getByRole('radio', { name: 'Wall', exact: true }).click()
  for (const position of ROOM_CORNERS) await plan.click({ position })
  await expect(page.getByRole('option', { name: /^Room,/ })).toHaveCount(1)
  await page.getByRole('radio', { name: 'Door', exact: true }).click()
  await plan.click({ position: DOOR_AT })
  await expect(page.getByRole('option', { name: / wide$/ })).toHaveCount(1)
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
  await page.getByRole('radio', { name: 'Select', exact: true }).click()
  await page.keyboard.press('Escape')
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
})
