import { test, expect, type Locator, type Page } from '@playwright/test'
import {
  boxOf,
  canvasBox,
  drawWall,
  drawWallAndWaitForSave,
  expectWallCount,
  gotoEditor,
  selectors,
} from './support'

// Issue #646: the plan stage takes the size of its pane. The canvas fills the plan area,
// nothing in the main pane scrolls for it, and a resize keeps the drawing under the same
// canvas-relative point (a resize never moves the viewport's scale or offset). Each reading
// is a box, an accessible state, or the scroll state of a box that must not scroll.

const WINDOW_NOMINAL = { width: 1280, height: 720 }
const WINDOW_SHORT = { width: 1280, height: 560 }
const WINDOW_NARROW = { width: 1000, height: 600 }
const WINDOW_LARGE = { width: 1400, height: 900 }
// Short enough that the plan area is smaller than the minimum stage, so the stage clamps.
const WINDOW_TINY = { width: 1280, height: 300 }

// The smallest stage the plan keeps (the stage never shrinks below it).
const MIN_STAGE = { width: 160, height: 120 }

// A horizontal wall near the top-left of the stage, inside the smallest stage that any
// window of this spec gives the plan or split pane, so each resize keeps it on the canvas.
const WALL_FROM = { x: 60, y: 90 }
const WALL_TO = { x: 260, y: 90 }
const WALL_MIDDLE = { x: 160, y: 90 }
const EMPTY_POINT = { x: 160, y: 200 }

// The Viewport landmark that holds the plan stage.
const viewportRegion = (page: Page) => page.getByRole('main', { name: 'Viewport' })
const zoomReadout = (page: Page) => page.getByRole('button', { name: 'Reset zoom to 100%' })
const thicknessField = (page: Page) => page.getByRole('textbox', { name: /thickness/i })

interface Box {
  x: number
  y: number
  width: number
  height: number
}

// Passes when the inner box lies within the outer box, give or take the slack in pixels.
function expectBoxInside(inner: Box, outer: Box, slack = 0): void {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - slack)
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - slack)
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + slack)
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + slack)
}

async function expectNoScroll(box: Locator): Promise<void> {
  const scroll = await box.evaluate((el) => ({
    top: el.scrollTop,
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }))
  expect(scroll.scrollWidth).toBe(scroll.clientWidth)
  expect(scroll.scrollHeight).toBe(scroll.clientHeight)
  expect(scroll.top).toBe(0)
}

// The canvas has no CSS size of its own, so a stylesheet rule that stretched it would break
// one backing pixel per rendered pixel. This guards that; the other tests prove the canvas
// follows its pane.
async function expectCanvasNotStretched(page: Page): Promise<void> {
  const box = await canvasBox(page)
  const backing = await selectors.planCanvas(page).evaluate((el) => {
    const canvas = el as HTMLCanvasElement
    return { width: canvas.width, height: canvas.height }
  })
  expect(backing.width).toBe(Math.floor(box.width))
  expect(backing.height).toBe(Math.floor(box.height))
}

// Draws the shared wall, switches to Select, and leaves nothing selected.
async function drawTheWall(page: Page): Promise<void> {
  await drawWall(page, WALL_FROM, WALL_TO)
  await expectWallCount(page, 1)
  await selectors.selectTool(page).click()
  await selectors.planCanvas(page).click({ position: EMPTY_POINT })
  await expect(thicknessField(page)).toHaveCount(0)
}

// A click at the wall's canvas-relative middle selects it, and a click on empty canvas
// clears the selection again, so the next check starts from nothing selected.
async function expectWallAtSamePoint(page: Page): Promise<void> {
  const canvas = selectors.planCanvas(page)
  await canvas.click({ position: WALL_MIDDLE })
  await expect(thicknessField(page)).toBeVisible()
  await canvas.click({ position: EMPTY_POINT })
  await expect(thicknessField(page)).toHaveCount(0)
}

// Every step of a sweep changes the window width, so the canvas width has a change to wait for.
async function resizeTo(page: Page, size: { width: number; height: number }): Promise<void> {
  const before = await canvasBox(page)
  await page.setViewportSize(size)
  await expect.poll(async () => (await canvasBox(page)).width).not.toBe(before.width)
  await expectCanvasNotStretched(page)
}

test.describe('the canvas fits the viewport region', () => {
  for (const size of [WINDOW_NOMINAL, WINDOW_SHORT]) {
    test(`lies inside the Viewport region with one backing pixel per CSS pixel at ${size.width}x${size.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(size)
      await gotoEditor(page)
      expectBoxInside(await canvasBox(page), await boxOf(viewportRegion(page)), 1)
      await expectCanvasNotStretched(page)
    })
  }
})

test.describe('the main pane does not scroll for the plan stage', () => {
  for (const size of [WINDOW_NOMINAL, WINDOW_SHORT]) {
    test(`stays unscrolled after a canvas click and after scrollIntoView at ${size.width}x${size.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(size)
      await gotoEditor(page)
      await expectNoScroll(viewportRegion(page))

      await selectors.planCanvas(page).click({ position: EMPTY_POINT })
      await expectNoScroll(viewportRegion(page))

      await selectors.planCanvas(page).evaluate((el) => el.scrollIntoView())
      await expectNoScroll(viewportRegion(page))
      await expect(page.getByRole('group', { name: 'View mode' })).toBeInViewport()
    })
  }
})

test('keeps a drawn wall under the same canvas point across window resizes', async ({ page }) => {
  await page.setViewportSize(WINDOW_NOMINAL)
  await gotoEditor(page)
  await drawTheWall(page)
  await expect(zoomReadout(page)).toHaveText('100%')

  for (const size of [WINDOW_NARROW, WINDOW_LARGE, WINDOW_NOMINAL]) {
    await resizeTo(page, size)
    await expectWallAtSamePoint(page)
    await expect(zoomReadout(page)).toHaveText('100%')
  }
})

test('fits the plan pane in split view and keeps the wall at the same canvas point', async ({
  page,
}) => {
  await page.setViewportSize(WINDOW_NOMINAL)
  await gotoEditor(page)
  await drawTheWall(page)

  await selectors.viewModeButton(page, 'Split view').click()
  await expect(selectors.threeDRegion(page)).toBeVisible()
  await expectCanvasNotStretched(page)

  const pane = selectors
    .planCanvas(page)
    .locator('xpath=ancestor::*[contains(@class, "view-mode-viewport__pane")]')
  await expectNoScroll(pane)
  expectBoxInside(await canvasBox(page), await boxOf(pane), 1)
  await expectWallAtSamePoint(page)
})

test('narrows the canvas with an ArrowLeft on the splitter and keeps the wall at its point', async ({
  page,
}) => {
  await page.setViewportSize(WINDOW_NOMINAL)
  await gotoEditor(page)
  await drawTheWall(page)
  await selectors.viewModeButton(page, 'Split view').click()
  await expect(selectors.threeDRegion(page)).toBeVisible()
  const before = await canvasBox(page)

  await page.getByRole('separator', { name: 'Resize panes' }).focus()
  await page.keyboard.press('ArrowLeft')

  await expect.poll(async () => (await canvasBox(page)).width).toBeLessThan(before.width)
  await expectCanvasNotStretched(page)
  await expectWallAtSamePoint(page)
})

test('keeps the wall at the same canvas point through Plan, 3D, Plan', async ({ page }) => {
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  await page.setViewportSize(WINDOW_NOMINAL)
  await gotoEditor(page)
  await drawTheWall(page)

  await selectors.viewModeButton(page, '3D view').click()
  await expect(selectors.planCanvas(page)).toHaveCount(0)
  await selectors.viewModeButton(page, 'Plan view').click()
  await expect(selectors.planCanvas(page)).toBeVisible()
  await expectCanvasNotStretched(page)
  await expectWallAtSamePoint(page)

  // The header zoom still answers while the plan stage is unmounted.
  await selectors.viewModeButton(page, '3D view').click()
  await expect(selectors.planCanvas(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await selectors.viewModeButton(page, 'Plan view').click()
  await expect(selectors.planCanvas(page)).toBeVisible()
  await expect(zoomReadout(page)).not.toHaveText('100%')
  expect(failures).toEqual([])
})

test('keeps every wall inside the canvas after a reload of a saved plan at 1280x560', async ({
  page,
}) => {
  await page.setViewportSize(WINDOW_SHORT)
  await gotoEditor(page)
  await drawWallAndWaitForSave(page)
  await drawWall(page, { x: 60, y: 260 }, { x: 460, y: 260 })
  await expectWallCount(page, 2)
  await expect(selectors.savedStatus(page)).toBeVisible()

  await page.reload()
  await expect(selectors.planCanvas(page)).toBeVisible()
  await expectWallCount(page, 2)

  const canvas = await canvasBox(page)
  for (const proxy of await selectors.wallProxies(page).all()) {
    expectBoxInside(await boxOf(proxy), canvas)
  }
})

test('holds the canvas at the minimum size and keeps the floors navigation in view at 1280x300', async ({
  page,
}) => {
  await page.setViewportSize(WINDOW_TINY)
  await gotoEditor(page)
  await expect(selectors.planCanvas(page)).toBeVisible()
  const box = await canvasBox(page)
  expect(box.width).toBeGreaterThanOrEqual(MIN_STAGE.width)
  expect(box.height).toBe(MIN_STAGE.height)
  await expectNoScroll(viewportRegion(page))
  await expect(page.getByRole('navigation', { name: 'Floors' })).toBeInViewport()
})

// The annotation keeps the measured sizes in the report, because the split-view coordinates in
// scene-orbit-pivot-holds.spec.ts and close-openings-support.ts were chosen from them.
test('gives the plan pane a narrower canvas in split view than in plan view at 1280x720', async ({
  page,
}) => {
  await page.setViewportSize(WINDOW_NOMINAL)
  await gotoEditor(page)
  const plan = await canvasBox(page)
  await selectors.viewModeButton(page, 'Split view').click()
  await expect(selectors.threeDRegion(page)).toBeVisible()
  const split = await canvasBox(page)
  const measured = `plan ${plan.width}x${plan.height}, split ${split.width}x${split.height}`
  test.info().annotations.push({ type: 'measured stage size', description: measured })
  expect(plan.width).toBeGreaterThan(split.width)
})
