import { test, expect, type Page } from '@playwright/test'
import { canvasBox, drawWall, expectWallCount, selectors, gotoEditor } from './support'

// Marquee multi-select: a Shift-drag adds to the selection, an Alt-drag subtracts
// from it, and a right-to-left drag grabs entities it merely crosses (issue #201).
// The selection is observed through the wall accessibility proxies, each of which
// carries aria-selected, so a count of selected "Wall, ..." options is the durable
// signal that the marquee folded into the selection as expected.

function selectedWalls(page: Page) {
  return page.getByRole('option', { name: /^Wall,/, selected: true })
}

async function marquee(
  page: Page,
  modifier: 'Shift' | 'Alt',
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const box = await canvasBox(page)
  await page.keyboard.down(modifier)
  await page.mouse.move(box.x + from.x, box.y + from.y)
  await page.mouse.down()
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.up(modifier)
}

test('a Shift-drag adds and an Alt-drag subtracts marquee selections', async ({ page }) => {
  await gotoEditor(page)
  const box = await canvasBox(page)

  // Two separated vertical walls, each enclosable by its own marquee.
  const xa = box.width * 0.3
  const xb = box.width * 0.6
  const yTop = box.height * 0.3
  const yBottom = box.height * 0.6
  await drawWall(page, { x: xa, y: yTop }, { x: xa, y: yBottom })
  await drawWall(page, { x: xb, y: yTop }, { x: xb, y: yBottom })
  await expectWallCount(page, 2)

  await selectors.selectTool(page).click()

  // First Shift-marquee selects wall A.
  await marquee(
    page,
    'Shift',
    { x: box.width * 0.2, y: box.height * 0.2 },
    { x: box.width * 0.4, y: box.height * 0.7 },
  )
  await expect(selectedWalls(page)).toHaveCount(1)

  // A second Shift-marquee over wall B adds it rather than replacing the selection.
  await marquee(
    page,
    'Shift',
    { x: box.width * 0.5, y: box.height * 0.2 },
    { x: box.width * 0.7, y: box.height * 0.7 },
  )
  await expect(selectedWalls(page)).toHaveCount(2)

  // An Alt-marquee over wall B subtracts it, leaving wall A selected.
  await marquee(
    page,
    'Alt',
    { x: box.width * 0.5, y: box.height * 0.2 },
    { x: box.width * 0.7, y: box.height * 0.7 },
  )
  await expect(selectedWalls(page)).toHaveCount(1)
})

test('a right-to-left marquee grabs a wall it only crosses', async ({ page }) => {
  await gotoEditor(page)
  const box = await canvasBox(page)

  // A horizontal wall whose left end sits outside the marquee region.
  const yMid = box.height * 0.5
  await drawWall(page, { x: box.width * 0.3, y: yMid }, { x: box.width * 0.7, y: yMid })
  await expectWallCount(page, 1)

  await selectors.selectTool(page).click()

  // A left-to-right (window) marquee over the right region misses the wall: its left
  // endpoint lies outside, so the wall is not fully contained.
  await marquee(
    page,
    'Shift',
    { x: box.width * 0.5, y: box.height * 0.4 },
    { x: box.width * 0.85, y: box.height * 0.6 },
  )
  await expect(selectedWalls(page)).toHaveCount(0)

  // The same region dragged right-to-left is a crossing marquee and grabs the wall.
  await marquee(
    page,
    'Shift',
    { x: box.width * 0.85, y: box.height * 0.4 },
    { x: box.width * 0.5, y: box.height * 0.6 },
  )
  await expect(selectedWalls(page)).toHaveCount(1)
})
