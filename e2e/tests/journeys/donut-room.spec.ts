import { test, expect } from '@playwright/test'
import { gotoEditor, expectWallCount, selectors } from './support'

// A courtyard layout: an outer wall loop with a smaller free-standing loop well
// inside it. The room that wraps the inner loop is a donut, and its accessible
// label tells a screen-reader user about the void.
test('derives a room with an interior void', async ({ page }) => {
  await gotoEditor(page)
  const canvas = selectors.planCanvas(page)

  // Outer loop, closed by clicking back on the first corner.
  await canvas.click({ position: { x: 160, y: 140 } })
  await canvas.click({ position: { x: 600, y: 140 } })
  await canvas.click({ position: { x: 600, y: 500 } })
  await canvas.click({ position: { x: 160, y: 500 } })
  await canvas.click({ position: { x: 160, y: 140 } })

  await expect(selectors.roomProxies(page)).toHaveCount(1)

  // Inner loop, well clear of the outer walls so it stays free-standing.
  await canvas.click({ position: { x: 320, y: 260 } })
  await canvas.click({ position: { x: 440, y: 260 } })
  await canvas.click({ position: { x: 440, y: 380 } })
  await canvas.click({ position: { x: 320, y: 380 } })
  await canvas.click({ position: { x: 320, y: 260 } })

  await expectWallCount(page, 8)

  // Two rooms now: the inner loop's own room, and the donut that surrounds it.
  await expect(selectors.roomProxies(page)).toHaveCount(2)
  await expect(page.getByRole('option', { name: /interior void/ })).toHaveCount(1)
})
