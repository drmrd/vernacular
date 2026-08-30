import { test, expect, type Page } from '@playwright/test'
import { canvasBox, drawWall, expectWallCount, selectors, gotoEditor } from './support'

// Marquee multi-select: the set operation locks from the modifiers held when the
// marquee begins (ADR-0126, amended for issue #605). Shift alone starts a replace
// marquee, Shift with Alt starts an additive one, and Alt alone starts a subtractive
// one; modifiers held at release play no part. A right-to-left drag grabs entities
// it merely crosses (issue #201).
// The selection is observed through the wall accessibility proxies, each of which
// carries aria-selected, so a count of selected "Wall, ..." options is the durable
// signal that the marquee folded into the selection as expected.

function selectedWalls(page: Page) {
  return page.getByRole('option', { name: /^Wall,/, selected: true })
}

async function marquee(
  page: Page,
  modifiers: readonly ('Shift' | 'Alt')[],
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const box = await canvasBox(page)
  for (const modifier of modifiers) {
    await page.keyboard.down(modifier)
  }
  await page.mouse.move(box.x + from.x, box.y + from.y)
  await page.mouse.down()
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 10 })
  await page.mouse.up()
  for (const modifier of [...modifiers].reverse()) {
    await page.keyboard.up(modifier)
  }
}

test('marquee modifiers replace, add to, and subtract from the selection', async ({ page }) => {
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

  const aFrom = { x: box.width * 0.2, y: box.height * 0.2 }
  const aTo = { x: box.width * 0.4, y: box.height * 0.7 }
  const bFrom = { x: box.width * 0.5, y: box.height * 0.2 }
  const bTo = { x: box.width * 0.7, y: box.height * 0.7 }

  // A Shift-marquee over wall A selects it.
  await marquee(page, ['Shift'], aFrom, aTo)
  await expect(selectedWalls(page)).toHaveCount(1)

  // A Shift+Alt marquee over wall B adds it to the selection.
  await marquee(page, ['Shift', 'Alt'], bFrom, bTo)
  await expect(selectedWalls(page)).toHaveCount(2)

  // A second plain Shift-marquee replaces the pair with just wall B.
  await marquee(page, ['Shift'], bFrom, bTo)
  await expect(selectedWalls(page)).toHaveCount(1)

  // An Alt-marquee over wall B subtracts it, emptying the selection.
  await marquee(page, ['Alt'], bFrom, bTo)
  await expect(selectedWalls(page)).toHaveCount(0)
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
    ['Shift'],
    { x: box.width * 0.5, y: box.height * 0.4 },
    { x: box.width * 0.85, y: box.height * 0.6 },
  )
  await expect(selectedWalls(page)).toHaveCount(0)

  // The same region dragged right-to-left is a crossing marquee and grabs the wall.
  await marquee(
    page,
    ['Shift'],
    { x: box.width * 0.85, y: box.height * 0.4 },
    { x: box.width * 0.5, y: box.height * 0.6 },
  )
  await expect(selectedWalls(page)).toHaveCount(1)
})
