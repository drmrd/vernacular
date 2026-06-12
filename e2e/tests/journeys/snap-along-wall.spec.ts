import { test, expect } from '@playwright/test'
import { gotoEditor, drawWall, expectWallCount, selectors } from './support'

test('snaps a new wall onto an existing wall', async ({ page }) => {
  await gotoEditor(page)

  // An existing horizontal wall spanning screen x 120..520 at y 200.
  await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })
  await expectWallCount(page, 1)

  const canvas = selectors.planCanvas(page)
  const box = await canvas.boundingBox()
  if (box === null) {
    throw new Error('plan canvas has no bounding box')
  }

  // Start a second wall well clear of the first, then move toward a point along the
  // existing wall that is clear of its endpoints, its midpoint, and the perpendicular
  // and parallel construction lines, so the on-edge snap is the only one in range.
  await canvas.click({ position: { x: 400, y: 360 } })
  await page.mouse.move(box.x + 250, box.y + 206)
  await expect(selectors.liveRegion(page)).toHaveText('Snapped to edge')

  // Commit the second wall at the snapped point; the plan now holds two walls.
  await canvas.click({ position: { x: 250, y: 206 } })
  // Finish the run with Enter so the buffered second wall commits.
  await page.keyboard.press('Enter')
  await expectWallCount(page, 2)
})
