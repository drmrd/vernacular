import { test, expect, type Page } from '@playwright/test'
import { gotoEditor, drawWall, expectWallCount, selectors } from './journeys/support'

// A horizontal wall in the upper-left, leaving room to the right for the jamb drag
// to travel toward the wall's far end. Fractions of the canvas box, no raw pixels.
const WALL_START = { x: 0.25, y: 0.35 }
const WALL_END = { x: 0.7, y: 0.35 }
const WALL_SPAN_FRACTION = WALL_END.x - WALL_START.x

// The plan never auto-fits (fit is bound to the 'f' key only), so a freshly drawn
// wall keeps the editor's default scale. These mirror the app's stable defaults
// (editor/plan/viewport DEFAULT_PLAN_SCALE, plan-scene PLAN_WIDTH, and core
// DEFAULT_OPENING_WIDTH_MM) so the spec can place the jamb handle deterministically
// without reading internal geometry.
const PLAN_BACKING_PX_PER_MM = 0.08
const PLAN_BACKING_WIDTH_PX = 800
const DEFAULT_OPENING_WIDTH_MM = 813

// A deliberate rightward drag of the end jamb, as a fraction of the canvas width. The
// exact amount is incidental; it only needs to widen the opening clearly while staying
// short of the wall's far end.
const WIDEN_FRACTION = 0.08

// Opening proxies read through their accessible label, which ends in "wide", so they
// are distinct from the wall and room proxies the overlay also renders.
const openingProxy = (page: Page) => page.getByRole('option', { name: / wide$/ })

test.describe('Opening resize handles', () => {
  test('resizes an opening by dragging a jamb handle and shows a live width readout', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 })
    await gotoEditor(page)

    const canvas = selectors.planCanvas(page)
    const box = await canvas.boundingBox()
    if (box === null) {
      throw new Error('Floor plan canvas has no bounding box')
    }

    const wallStart = { x: box.width * WALL_START.x, y: box.height * WALL_START.y }
    const wallEnd = { x: box.width * WALL_END.x, y: box.height * WALL_END.y }
    await drawWall(page, wallStart, wallEnd)
    await expectWallCount(page, 1)

    // Place a single opening near the middle of the wall via the door chip.
    await page.getByRole('button', { name: 'Door', exact: true }).click()
    await canvas.click({ position: { x: (wallStart.x + wallEnd.x) / 2, y: wallStart.y } })
    await expect(openingProxy(page)).toHaveCount(1)

    // Select the opening through its accessibility proxy (pointer-events:none, so the
    // click reaches the canvas beneath it). Selecting arms its resize handles.
    await selectors.selectTool(page).click()
    const proxyBefore = await openingProxy(page).boundingBox()
    if (proxyBefore === null) {
      throw new Error('Opening proxy has no bounding box')
    }
    // The proxy is an 8px box whose top-left sits on the opening's center anchor.
    const center = { x: proxyBefore.x, y: proxyBefore.y }
    await page.mouse.click(center.x + proxyBefore.width / 2, center.y + proxyBefore.height / 2)
    const labelBefore = await openingProxy(page).getAttribute('aria-label')

    // Convert the opening's half-width from millimeters to client pixels along the wall.
    // The wall world length follows from the fixed scale; the wall's client span gives
    // the world-to-client ratio, which stays correct even if the canvas is stretched.
    const wallWorldMm = (WALL_SPAN_FRACTION * PLAN_BACKING_WIDTH_PX) / PLAN_BACKING_PX_PER_MM
    const worldToClientPx = (box.width * WALL_SPAN_FRACTION) / wallWorldMm
    const jambOffsetX = (DEFAULT_OPENING_WIDTH_MM / 2) * worldToClientPx
    // The end jamb sits at the right edge of the footprint on the wall centerline.
    const endJamb = { x: center.x + jambOffsetX, y: center.y }

    // Press the end-jamb handle and drag it to the right without releasing.
    await page.mouse.move(endJamb.x, endJamb.y)
    await page.mouse.down()
    await page.mouse.move(endJamb.x + box.width * WIDEN_FRACTION, endJamb.y, { steps: 10 })

    // While the drag is live, the width readout pill sits near the handle and reads a
    // number. We pin the behavior, not the value: it is visible and carries a digit.
    const readout = selectors.drawReadout(page)
    await expect(readout).toBeVisible()
    await expect(readout).toHaveText(/\d/)

    // Release to commit the resize. The readout is transient view state, so it clears,
    // and the opening is now wider, so its proxy label changes.
    await page.mouse.up()
    await expect(readout).toHaveCount(0)
    await expect(openingProxy(page)).not.toHaveAttribute('aria-label', labelBefore ?? '')
  })
})
