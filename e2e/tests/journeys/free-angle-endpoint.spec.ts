import { test, expect, type Page, type Locator } from '@playwright/test'
import { drawWall, selectors } from './support'

// Canvas-relative fractions for the horizontal wall's endpoints. Sharing the y
// fraction keeps the drawn wall horizontal so the angle lock squares the plain
// drag below to a clean horizontal bearing.
const WALL_A = { x: 0.2, y: 0.45 }
const WALL_B = { x: 0.5, y: 0.45 }

// Read the live endpoint-drag readout pill's text, asserting it is visible first.
async function readReadout(page: Page): Promise<string> {
  const readout = selectors.drawReadout(page)
  await expect(readout).toBeVisible()
  return (await readout.textContent()) ?? ''
}

// Select the wall through its accessibility proxy so its endpoint handles arm.
async function selectWall(page: Page): Promise<Locator> {
  const proxy = selectors.wallProxy(page)
  await proxy.focus()
  await page.keyboard.press('Enter')
  await expect(proxy).toHaveAttribute('aria-selected', 'true')
  return proxy
}

test('frees a dragged wall endpoint from the angle lock with the modifier', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  const canvas = selectors.planCanvas(page)
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  if (box === null) {
    throw new Error('Floor plan canvas has no bounding box')
  }

  // Draw a horizontal wall (shared y fraction) and confirm it landed.
  await drawWall(
    page,
    { x: box.width * WALL_A.x, y: box.height * WALL_A.y },
    { x: box.width * WALL_B.x, y: box.height * WALL_B.y },
  )
  await expect(selectors.wallProxies(page)).toHaveCount(1)

  await selectors.selectTool(page).click()
  await selectWall(page)

  // Absolute screen points for the dragged endpoint B and the fixed endpoint A.
  const bScreen = { x: box.x + box.width * WALL_B.x, y: box.y + box.height * WALL_B.y }
  const aScreen = { x: box.x + box.width * WALL_A.x, y: box.y + box.height * WALL_A.y }

  // A long, off-axis drag target about 20 degrees off horizontal (tan 20deg ~= 0.36).
  // 20 degrees is closer to the 0-degree ray than the 45-degree ray, so the angle
  // lock squares it to horizontal. The long reach keeps grid snapping from
  // perturbing the bearing.
  const dx = box.width * 0.45
  const target = { x: aScreen.x + dx, y: aScreen.y + dx * 0.36 }

  // Plain drag: the angle lock is active, so the readout squares to horizontal.
  await page.mouse.move(bScreen.x, bScreen.y)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 10 })
  const plainReadout = await readReadout(page)
  await page.mouse.up()

  // Restore the wall and re-select it (undo may clear the selection).
  await selectors.undoButton(page).click()
  await selectWall(page)

  // Alt drag: holding the free-angle modifier suspends the lock, so the dragged
  // endpoint follows the free ~20-degree angle instead of squaring to horizontal.
  await page.mouse.move(bScreen.x, bScreen.y)
  await page.mouse.down()
  await page.keyboard.down('Alt')
  await page.mouse.move(target.x, target.y, { steps: 10 })
  const altReadout = await readReadout(page)
  await page.mouse.up()
  await page.keyboard.up('Alt')

  // With the lock active in both drags (today's behavior) both readouts square the
  // same off-axis target to the same horizontal bearing, so the texts match and this
  // assertion FAILS (RED). Once the free-angle modifier reaches endpoint editing the
  // Alt drag follows the free angle, so its readout differs and the test passes.
  expect(altReadout).not.toBe(plainReadout)
})

test('re-resolves a paused endpoint drag when the modifier toggles in place', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  const canvas = selectors.planCanvas(page)
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  if (box === null) {
    throw new Error('Floor plan canvas has no bounding box')
  }

  await drawWall(
    page,
    { x: box.width * WALL_A.x, y: box.height * WALL_A.y },
    { x: box.width * WALL_B.x, y: box.height * WALL_B.y },
  )
  await expect(selectors.wallProxies(page)).toHaveCount(1)
  await selectors.selectTool(page).click()
  await selectWall(page)

  const bScreen = { x: box.x + box.width * WALL_B.x, y: box.y + box.height * WALL_B.y }
  const aScreen = { x: box.x + box.width * WALL_A.x, y: box.y + box.height * WALL_A.y }
  const dx = box.width * 0.45
  const target = { x: aScreen.x + dx, y: aScreen.y + dx * 0.36 }

  // Plain drag squares the off-axis target to horizontal; capture that text.
  await page.mouse.move(bScreen.x, bScreen.y)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 10 })
  const squared = await readReadout(page)

  // Press the modifier WITHOUT moving the pointer. Today the readout only
  // re-resolves on a pointer move, so pressing Alt alone leaves it on the squared
  // text and this retrying assertion times out (RED). Once endpoint editing
  // re-resolves its preview on the modifier toggle, the readout switches to the
  // free bearing in place and this passes.
  await page.keyboard.down('Alt')
  await expect(selectors.drawReadout(page)).not.toHaveText(squared, { timeout: 3000 })

  await page.mouse.up()
  await page.keyboard.up('Alt')
})
