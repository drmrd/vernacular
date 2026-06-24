import { test, expect, type Page } from '@playwright/test'
import { gotoEditor, drawWall, expectWallCount, selectors } from './support'

// Two doors sit on one horizontal wall in the upper area of the plan, leaving room
// to the right for a jamb to travel toward the wall's far end. Fractions of the
// canvas box, no raw pixels, so the spec is resolution-independent.
const WALL_START = { x: 0.2, y: 0.4 }
const WALL_END = { x: 0.85, y: 0.4 }
const WALL_SPAN_FRACTION = WALL_END.x - WALL_START.x
// A deliberate jamb-drag target well to the right of the right door, still short of
// the wall's far end so the drag does not run off the wall.
const FAR_RIGHT_X = 0.84

// The plan never auto-fits, so a freshly drawn wall keeps the editor's default scale.
// These mirror the app's stable defaults (editor/plan/viewport DEFAULT_PLAN_SCALE via
// PLAN_BACKING_PX_PER_MM, plan-scene PLAN_WIDTH, and core DEFAULT_OPENING_WIDTH_MM) so
// the spec can place the jamb handle deterministically without reading internal geometry.
const PLAN_BACKING_PX_PER_MM = 0.08
const PLAN_BACKING_WIDTH_PX = 800
const DEFAULT_OPENING_WIDTH_MM = 813

// Opening proxies read through their accessible label, which ends in "wide", so they
// are distinct from the wall and room proxies the overlay also renders.
const openingProxies = (page: Page) => page.getByRole('option', { name: / wide$/ })

// The absolute client-x of every opening proxy's center anchor, ascending. Each proxy
// is an 8px box sitting on the opening's center, so its box center is the opening's
// along-wall position projected to the screen.
async function openingCenterXs(page: Page): Promise<number[]> {
  const proxies = openingProxies(page)
  const count = await proxies.count()
  const centers: number[] = []
  for (let index = 0; index < count; index += 1) {
    const box = await proxies.nth(index).boundingBox()
    if (box === null) {
      throw new Error('Opening proxy has no bounding box')
    }
    centers.push(box.x + box.width / 2)
  }
  return centers.sort((a, b) => a - b)
}

// Place a door on the wall at the given canvas-relative x by clicking the Door chip
// (which arms the place-opening tool) and clicking the wall centerline.
async function placeDoorAt(page: Page, box: { width: number; height: number }, xFraction: number) {
  await page.getByRole('button', { name: 'Door', exact: true }).click()
  await selectors
    .planCanvas(page)
    .click({ position: { x: box.width * xFraction, y: box.height * WALL_START.y } })
}

test.describe('Opening edit overlap guard', () => {
  test('dragging an opening along its wall stops flush against a neighbor instead of overlapping', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 })
    await gotoEditor(page)

    const canvas = selectors.planCanvas(page)
    const box = await canvas.boundingBox()
    if (box === null) {
      throw new Error('Floor plan canvas has no bounding box')
    }

    await drawWall(
      page,
      { x: box.width * WALL_START.x, y: box.height * WALL_START.y },
      { x: box.width * WALL_END.x, y: box.height * WALL_END.y },
    )
    await expectWallCount(page, 1)

    // The left door sits well clear of the right door, so a successful drag must move
    // it a long way; the right door is the neighbor it will be dragged onto.
    const leftStartFraction = 0.25
    const neighborFraction = 0.6
    await placeDoorAt(page, box, leftStartFraction)
    await placeDoorAt(page, box, neighborFraction)
    await expect(openingProxies(page)).toHaveCount(2)

    // Select the left door (its proxy is pointer-events:none, so the click reaches the
    // canvas beneath), then grab its footprint and drag it onto the right door.
    await selectors.selectTool(page).click()
    const wallY = box.y + box.height * WALL_START.y
    const leftStart = box.x + box.width * leftStartFraction
    const neighborCenter = box.x + box.width * neighborFraction
    await page.mouse.click(leftStart, wallY)
    await page.mouse.move(leftStart, wallY)
    await page.mouse.down()
    await page.mouse.move(neighborCenter, wallY, { steps: 12 })
    await page.mouse.up()

    // The drag aimed the left door's center onto the right door's center. The dragged
    // door must have moved a long way toward the neighbor (proving the drag engaged),
    // yet stay clearly to its left rather than overlapping it (proving the guard clamped
    // the move flush against the neighbor).
    const [dragged, neighbor] = await openingCenterXs(page)
    expect(dragged).toBeGreaterThan(box.x + box.width * 0.4)
    expect(dragged).toBeLessThan(neighbor - box.width * 0.03)
  })

  test('widening an opening by its jamb stops flush against a neighbor instead of overlapping', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 })
    await gotoEditor(page)

    const canvas = selectors.planCanvas(page)
    const box = await canvas.boundingBox()
    if (box === null) {
      throw new Error('Floor plan canvas has no bounding box')
    }

    await drawWall(
      page,
      { x: box.width * WALL_START.x, y: box.height * WALL_START.y },
      { x: box.width * WALL_END.x, y: box.height * WALL_END.y },
    )
    await expectWallCount(page, 1)

    // The two doors sit close together so that, without the guard, widening the left
    // door's end jamb toward the wall's far end would overrun the right door.
    const leftFraction = 0.3
    const neighborFraction = 0.42
    await placeDoorAt(page, box, leftFraction)
    await placeDoorAt(page, box, neighborFraction)
    await expect(openingProxies(page)).toHaveCount(2)

    // Convert the opening's half-width from millimeters to client pixels along the wall
    // (mirrors opening-resize-handles.spec): the wall world length follows from the fixed
    // scale, and the wall's client span gives the world-to-client ratio.
    const wallWorldMm = (WALL_SPAN_FRACTION * PLAN_BACKING_WIDTH_PX) / PLAN_BACKING_PX_PER_MM
    const worldToClientPx = (box.width * WALL_SPAN_FRACTION) / wallWorldMm
    const jambOffsetX = (DEFAULT_OPENING_WIDTH_MM / 2) * worldToClientPx

    const wallY = box.y + box.height * WALL_START.y
    const neighborCenter = box.x + box.width * neighborFraction

    // Select the left door, grab its end (right) jamb handle, and drag it far to the
    // right, past the right door's near jamb, toward the wall's far end.
    await selectors.selectTool(page).click()
    const leftCenter = box.x + box.width * leftFraction
    await page.mouse.click(leftCenter, wallY)
    const endJamb = leftCenter + jambOffsetX
    await page.mouse.move(endJamb, wallY)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * FAR_RIGHT_X, wallY, { steps: 12 })

    // The live width readout proves the jamb grab engaged and a resize is in progress.
    const readout = selectors.drawReadout(page)
    await expect(readout).toBeVisible()
    await page.mouse.up()

    // The right door never moves, so its proxy stays near its original center; the other
    // proxy is the widened door. Without the guard the widened door's end jamb would
    // overrun the neighbor and push its center past the right door's center; the guard
    // clamps the jamb flush against the neighbor, keeping the widened door's center
    // clearly to the left of it.
    const centers = await openingCenterXs(page)
    const neighbor = centers.reduce((nearest, x) =>
      Math.abs(x - neighborCenter) < Math.abs(nearest - neighborCenter) ? x : nearest,
    )
    const widened = centers.find((x) => x !== neighbor)
    expect(widened).toBeDefined()
    expect(widened!).toBeLessThan(neighbor - box.width * 0.03)
  })
})
