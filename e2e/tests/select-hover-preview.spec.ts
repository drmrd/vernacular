import { test, expect } from '@playwright/test'
import { drawWall, selectors } from './journeys/support'

// Canvas-relative offsets for the wall endpoints, expressed as fractions of the
// canvas box so the spec carries no raw pixel magic numbers.
const WALL_START = { x: 0.3, y: 0.3 }
const WALL_END = { x: 0.3, y: 0.6 }
// An empty patch of the canvas, near a corner and well clear of the drawn wall.
const EMPTY_SPOT = { x: 0.85, y: 0.85 }

test.describe('Select-mode hover preview', () => {
  test('highlights the entity under the cursor at rest and clears it over empty space without selecting', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.goto('/')

    const canvas = selectors.planCanvas(page)
    await expect(canvas).toBeVisible()

    const box = await canvas.boundingBox()
    if (box === null) {
      throw new Error('Floor plan canvas has no bounding box')
    }

    // Draw a single vertical wall, then confirm it landed.
    await drawWall(
      page,
      { x: box.width * WALL_START.x, y: box.height * WALL_START.y },
      { x: box.width * WALL_END.x, y: box.height * WALL_END.y },
    )
    await expect(selectors.wallProxies(page)).toHaveCount(1)

    // Switch to Select mode. The pointer now rests on the Select button, off the
    // canvas, so the canvas shows its at-rest image with nothing hovered.
    await selectors.selectTool(page).click()

    const snapshot = (): Promise<string> =>
      selectors.planCanvas(page).evaluate((c) => (c as HTMLCanvasElement).toDataURL())
    const atRest = await snapshot()

    // Locate the wall on screen through its accessibility proxy (pointer-events:none,
    // so the move reaches the canvas beneath it) and move the real pointer to its center.
    const proxy = await selectors.wallProxy(page).boundingBox()
    if (proxy === null) {
      throw new Error('Wall accessibility proxy has no bounding box')
    }
    await page.mouse.move(proxy.x + proxy.width / 2, proxy.y + proxy.height / 2)
    const hovered = await snapshot()

    // The hover highlight under the cursor must have changed the canvas.
    expect(hovered).not.toBe(atRest)

    // Move to empty space; the hover highlight clears and the canvas returns to rest.
    await page.mouse.move(box.x + box.width * EMPTY_SPOT.x, box.y + box.height * EMPTY_SPOT.y)
    const cleared = await snapshot()
    expect(cleared).toBe(atRest)

    // Hovering never selects: the wall thickness editor a selected wall would show
    // must not be present.
    await expect(page.getByRole('textbox', { name: /thickness/i })).toHaveCount(0)
  })
})
