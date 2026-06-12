import { test, expect } from '@playwright/test'
import { gotoEditor, expectWallCount, selectors } from './support'

test('draws a chained polyline and closes it into a room', async ({ page }) => {
  await gotoEditor(page)
  const canvas = selectors.planCanvas(page)

  await canvas.click({ position: { x: 160, y: 160 } }) // first corner
  await canvas.click({ position: { x: 460, y: 160 } })
  await canvas.click({ position: { x: 460, y: 360 } })
  await canvas.click({ position: { x: 200, y: 360 } }) // a mis-placed corner
  await page.keyboard.press('Backspace') // take it back
  await canvas.click({ position: { x: 160, y: 360 } }) // the real fourth corner
  await canvas.click({ position: { x: 160, y: 160 } }) // back on the first corner closes the loop

  await expectWallCount(page, 4)
  await expect(selectors.roomProxies(page)).toHaveCount(1)
})

test('finishes an open run with a double-click and extends it from an endpoint', async ({
  page,
}) => {
  await gotoEditor(page)
  const canvas = selectors.planCanvas(page)

  await canvas.click({ position: { x: 160, y: 200 } })
  await canvas.click({ position: { x: 360, y: 200 } })
  await canvas.dblclick({ position: { x: 360, y: 360 } }) // commit the corner and finish
  await expectWallCount(page, 2)
  await expect(selectors.roomProxies(page)).toHaveCount(0)

  // Extend: start a new run on the free endpoint and add one segment.
  await canvas.click({ position: { x: 360, y: 360 } }) // snaps to the committed endpoint
  await canvas.click({ position: { x: 560, y: 360 } })
  await page.keyboard.press('Enter')
  await expectWallCount(page, 3)
})
