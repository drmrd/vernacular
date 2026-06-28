import { test, expect, type Page } from '@playwright/test'
import { drawWall, selectors } from './journeys/support'

// Canvas-relative offsets for a single vertical wall, as fractions of the canvas
// box so the spec carries no raw pixel magic numbers.
const WALL_START = { x: 0.3, y: 0.3 }
const WALL_END = { x: 0.3, y: 0.6 }
// An empty patch near a corner, well clear of the drawn wall, used to deselect.
const EMPTY_SPOT = { x: 0.85, y: 0.85 }

// Click the real pointer at the center of the wall's accessibility proxy. The
// proxy is pointer-events:none, so the click falls through to the canvas beneath
// and runs the plan's hit-test selection the same way a user click would.
async function clickWallThroughProxy(page: Page): Promise<void> {
  const proxy = await selectors.wallProxy(page).boundingBox()
  if (proxy === null) {
    throw new Error('wall accessibility proxy has no bounding box')
  }
  await page.mouse.click(proxy.x + proxy.width / 2, proxy.y + proxy.height / 2)
}

// The edit-layer selector scopes pointer selection to one layer. With the wall on
// the active layer a click selects it; with an off-layer mode active the same click
// is inert (the wall stays visible but is no longer a selection candidate). This is
// the end-to-end proof of the selection/hover/move graph narrowing wired into the
// plan view; the narrowing logic itself is covered by the edit-layer-scope unit tests.
test.describe('Per-layer edit modes scope plan selection', () => {
  test('a wall is selectable on its layer and inert off it', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.goto('/')

    const canvas = selectors.planCanvas(page)
    await expect(canvas).toBeVisible()
    const box = await canvas.boundingBox()
    if (box === null) {
      throw new Error('floor plan canvas has no bounding box')
    }

    await drawWall(
      page,
      { x: box.width * WALL_START.x, y: box.height * WALL_START.y },
      { x: box.width * WALL_END.x, y: box.height * WALL_END.y },
    )
    await expect(selectors.wallProxies(page)).toHaveCount(1)
    await selectors.selectTool(page).click()
    const wall = selectors.wallProxy(page)

    // Baseline: the default "All" layer leaves the wall selectable, so a click selects it.
    await clickWallThroughProxy(page)
    await expect(wall).toHaveAttribute('aria-selected', 'true')

    // Clear the selection by clicking an empty patch.
    await page.mouse.click(box.x + box.width * EMPTY_SPOT.x, box.y + box.height * EMPTY_SPOT.y)
    await expect(wall).toHaveAttribute('aria-selected', 'false')

    // Enter the Annotations layer: walls are now off-layer, so the same click is inert.
    await page.getByRole('radio', { name: 'Annotations', exact: true }).click()
    await clickWallThroughProxy(page)
    await expect(wall).toHaveAttribute('aria-selected', 'false')

    // Enter the Walls layer: the wall is selectable again and the click selects it.
    await page.getByRole('radio', { name: 'Walls', exact: true }).click()
    await clickWallThroughProxy(page)
    await expect(wall).toHaveAttribute('aria-selected', 'true')
  })
})
