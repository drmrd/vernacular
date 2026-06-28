import { test, expect, type Page } from '@playwright/test'
import { drawWall, selectors } from './journeys/support'

// Canvas-relative offsets for a single vertical wall, as fractions of the canvas
// box so the spec carries no raw pixel magic numbers.
const WALL_START = { x: 0.3, y: 0.3 }
const WALL_END = { x: 0.3, y: 0.6 }
// An empty patch near a corner, well clear of the drawn wall, used to deselect.
const EMPTY_SPOT = { x: 0.85, y: 0.85 }

// The screen-space center of the wall's accessibility proxy, captured while the
// wall is on the active layer so the proxy exists. Switching layers never moves
// the wall on screen, so this point stays valid for a later click after the proxy
// has dropped out of the off-layer overlay.
async function wallProxyCenter(page: Page): Promise<{ x: number; y: number }> {
  const proxy = await selectors.wallProxy(page).boundingBox()
  if (proxy === null) {
    throw new Error('wall accessibility proxy has no bounding box')
  }
  return { x: proxy.x + proxy.width / 2, y: proxy.y + proxy.height / 2 }
}

// The edit-layer selector scopes both input paths to one layer. With the wall on the
// active layer it is keyboard-reachable (a "Wall" option proxy in the overlay) and a
// pointer click selects it. With an off-layer mode active the proxy drops out of the
// overlay so a keyboard user cannot reach it, and the same pointer click is inert: the
// wall stays visible but is no longer a selection candidate. This is the end-to-end
// proof that the active edit layer narrows the overlay proxies and the pointer hit-test
// alike; the narrowing logic itself is covered by the edit-layer-scope unit tests.
test.describe('Per-layer edit modes scope plan selection', () => {
  test('a wall is keyboard-reachable and selectable on its layer and inert off it', async ({
    page,
  }) => {
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
    const wallPoint = await wallProxyCenter(page)

    // Baseline: the default "All" layer leaves the wall reachable, so a click selects it.
    await page.mouse.click(wallPoint.x, wallPoint.y)
    await expect(selectors.wallProxy(page)).toHaveAttribute('aria-selected', 'true')

    // Clear the selection by clicking an empty patch.
    await page.mouse.click(box.x + box.width * EMPTY_SPOT.x, box.y + box.height * EMPTY_SPOT.y)
    await expect(selectors.wallProxy(page)).toHaveAttribute('aria-selected', 'false')

    // Enter the Annotations layer: walls are now off-layer. The proxy drops out of the
    // overlay (no keyboard reach) and the same pointer click is inert.
    await page.getByRole('radio', { name: 'Annotations', exact: true }).click()
    await expect(selectors.wallProxies(page)).toHaveCount(0)
    await page.mouse.click(wallPoint.x, wallPoint.y)

    // Enter the Walls layer: the wall proxy returns and was not selected by the off-layer
    // click, then the same click selects it again.
    await page.getByRole('radio', { name: 'Walls', exact: true }).click()
    await expect(selectors.wallProxies(page)).toHaveCount(1)
    await expect(selectors.wallProxy(page)).toHaveAttribute('aria-selected', 'false')
    await page.mouse.click(wallPoint.x, wallPoint.y)
    await expect(selectors.wallProxy(page)).toHaveAttribute('aria-selected', 'true')
  })
})
