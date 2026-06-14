import { test, expect, type Page } from '@playwright/test'
import { gotoEditor, drawWall, expectWallCount, selectors } from './journeys/support'

// A horizontal wall in the upper-left, leaving room to the right for the jamb drag
// to travel toward the wall's far end. Fractions of the canvas box, no raw pixels.
const WALL_START = { x: 0.25, y: 0.35 }
const WALL_END = { x: 0.7, y: 0.35 }

// A deliberate rightward drag of the end jamb, in screen pixels. The exact amount is
// incidental; it only needs to widen the opening clearly while staying on the wall.
const WIDEN_OFFSET = 140

// Opening proxies read through their accessible label, which ends in "wide" (e.g.
// "Single Swing Door, 81.3 cm wide"), so they are distinct from the wall and room
// proxies the overlay also renders.
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

    // Place a single opening near the middle of the wall via the opening tool.
    await selectors.tool(page, 'Opening').click()
    await canvas.click({ position: { x: (wallStart.x + wallEnd.x) / 2, y: wallStart.y } })
    await expect(openingProxy(page)).toHaveCount(1)

    // Select the opening through its accessibility proxy (pointer-events:none, so the
    // click reaches the canvas beneath it). Selecting arms its resize handles.
    await selectors.selectTool(page).click()
    const proxyBefore = await openingProxy(page).boundingBox()
    if (proxyBefore === null) {
      throw new Error('Opening proxy has no bounding box')
    }
    await page.mouse.click(
      proxyBefore.x + proxyBefore.width / 2,
      proxyBefore.y + proxyBefore.height / 2,
    )
    const labelBefore = await openingProxy(page).getAttribute('aria-label')

    // The end jamb sits at the right edge of the footprint on the wall centerline.
    const endJamb = {
      x: proxyBefore.x + proxyBefore.width,
      y: proxyBefore.y + proxyBefore.height / 2,
    }

    // Press the end-jamb handle and drag it to the right without releasing.
    await page.mouse.move(endJamb.x, endJamb.y)
    await page.mouse.down()
    await page.mouse.move(endJamb.x + WIDEN_OFFSET, endJamb.y, { steps: 10 })

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
