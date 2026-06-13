import { test, expect } from '@playwright/test'
import { gotoEditor, selectors, selectWallTool } from './support'

// Each wall segment commits when its end corner is placed (ADR-0060), so a closing
// or partition wall forms its room with no Enter or double-click to finish.
test('a partition wall splits a room without a finish keypress', async ({ page }) => {
  await gotoEditor(page)
  await selectWallTool(page)
  const canvas = selectors.planCanvas(page)

  // A closed rectangle drawn as a continuous run, closed by clicking the first corner.
  await canvas.click({ position: { x: 200, y: 150 } })
  await canvas.click({ position: { x: 500, y: 150 } })
  await canvas.click({ position: { x: 500, y: 400 } })
  await canvas.click({ position: { x: 200, y: 400 } })
  await canvas.click({ position: { x: 200, y: 150 } }) // back on the first corner closes the loop
  await expect(selectors.roomProxies(page)).toHaveCount(1)

  // A partition: two clicks landing on the top and bottom walls. The second click
  // commits the wall, so the room splits with no finish gesture.
  await canvas.click({ position: { x: 350, y: 150 } })
  await canvas.click({ position: { x: 350, y: 400 } })
  await expect(selectors.roomProxies(page)).toHaveCount(2)
})
