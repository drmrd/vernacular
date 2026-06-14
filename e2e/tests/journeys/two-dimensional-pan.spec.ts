import { test, expect } from '@playwright/test'
import {
  canvasBox,
  drawWall,
  expectWallCount,
  gotoEditor,
  selectors,
  selectWallTool,
} from './support'

// A plain primary-button drag on empty canvas in Select mode pans the view (ADR-0069),
// and Shift-drag still draws the selection marquee. The pan is verified the same 1:1 way
// as the middle-mouse pan (canvas-pan-alignment): pan a vertical wall sideways, then click
// where it landed. The middle-mouse path is covered separately; this proves the primary
// drag in the default Select tool.

test('a plain primary drag pans the view in Select mode', async ({ page }) => {
  await gotoEditor(page)
  const box = await canvasBox(page)

  // A vertical wall at x0, so a horizontal pan moves it to a column that was empty before.
  const x0 = box.width * 0.3
  await drawWall(page, { x: x0, y: box.height * 0.3 }, { x: x0, y: box.height * 0.6 })
  await expectWallCount(page, 1)

  await selectors.selectTool(page).click()

  // Primary-button drag starting on empty canvas (well right of the wall), to the right.
  const pan = box.width * 0.25
  const sx = box.x + box.width * 0.6
  const sy = box.y + box.height * 0.5
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + pan, sy, { steps: 10 })
  await page.mouse.up()

  // A correct 1:1 pan moves the wall right by exactly `pan`, so it now sits at x0 + pan.
  // Clicking that column selects the wall, which proves a pan happened (not a marquee that
  // would have cleared the selection, and not a drawn wall).
  await selectors.planCanvas(page).click({ position: { x: x0 + pan, y: box.height * 0.45 } })
  await expect(page.getByRole('textbox', { name: /thickness/i })).toBeVisible()
})

test('a Shift-drag still draws a marquee that selects', async ({ page }) => {
  await gotoEditor(page)
  const box = await canvasBox(page)

  const x0 = box.width * 0.3
  await drawWall(page, { x: x0, y: box.height * 0.3 }, { x: x0, y: box.height * 0.6 })
  await expectWallCount(page, 1)

  await selectors.selectTool(page).click()

  // Shift held turns the drag into a marquee. The rectangle encloses both wall endpoints,
  // so the window-selection marquee picks the wall up.
  await page.keyboard.down('Shift')
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.7, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.up('Shift')

  await expect(page.getByRole('textbox', { name: /thickness/i })).toBeVisible()
})

test('a spacebar pan keeps an in-progress wall run intact', async ({ page }) => {
  await gotoEditor(page)
  await selectWallTool(page)
  const box = await canvasBox(page)
  const canvas = selectors.planCanvas(page)

  // Start a wall run with one vertex; do not finish it.
  await canvas.click({ position: { x: box.width * 0.25, y: box.height * 0.3 } })

  // Spring-loaded pan: hold the spacebar, drag the view, release. The pan takes the
  // pointer before the wall tool and never touches the run, so the run survives.
  await page.keyboard.down('Space')
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.6, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.up('Space')

  // Placing the second vertex commits the segment (immediate-commit), which proves the
  // run continued through the pan rather than resetting to an empty tool.
  await canvas.click({ position: { x: box.width * 0.55, y: box.height * 0.55 } })
  await page.keyboard.press('Enter')
  await expectWallCount(page, 1)
})
