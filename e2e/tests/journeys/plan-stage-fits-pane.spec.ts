import { test, expect, type Locator, type Page } from '@playwright/test'
import {
  canvasBox,
  drawWall,
  drawWallAndWaitForSave,
  expectWallCount,
  gotoEditor,
  selectors,
} from './support'

// Issue #646: the plan stage takes the size of its pane. The canvas fills the plan area,
// nothing in the main pane scrolls for it, and a resize keeps the drawing under the same
// canvas-relative point (a resize never moves the viewport's scale or offset). Every
// reading here is a box or an accessible state a person can see, never an internal size.

const WINDOW_NOMINAL = { width: 1280, height: 720 }
const WINDOW_SHORT = { width: 1280, height: 560 }
const WINDOW_NARROW = { width: 1000, height: 600 }
const WINDOW_LARGE = { width: 1400, height: 900 }
const WINDOW_TINY = { width: 1280, height: 380 }

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

async function boxOf(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox()
  if (box === null) {
    throw new Error('the element has no bounding box')
  }
  return box
}

interface Scroll {
  top: number
  scrollHeight: number
  clientHeight: number
}

async function scrollOfViewport(page: Page): Promise<Scroll> {
  return viewportRegion(page).evaluate((el) => ({
    top: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }))
}

async function expectNoScroll(page: Page): Promise<void> {
  const scroll = await scrollOfViewport(page)
  expect(scroll.scrollHeight).toBe(scroll.clientHeight)
  expect(scroll.top).toBe(0)
}

async function expectCanvasInsideViewportRegion(page: Page): Promise<void> {
  const canvas = await boxOf(selectors.planCanvas(page))
  const region = await boxOf(viewportRegion(page))
  expect(canvas.x).toBeGreaterThanOrEqual(region.x)
  expect(canvas.y).toBeGreaterThanOrEqual(region.y)
  expect(canvas.x + canvas.width).toBeLessThanOrEqual(region.x + region.width + 1)
  expect(canvas.y + canvas.height).toBeLessThanOrEqual(region.y + region.height + 1)
}

async function expectBackingStoreIsCssSize(page: Page): Promise<void> {
  const sizes = await selectors.planCanvas(page).evaluate((el) => {
    const canvas = el as HTMLCanvasElement
    const style = getComputedStyle(canvas)
    return {
      backingWidth: canvas.width,
      backingHeight: canvas.height,
      cssWidth: parseFloat(style.width),
      cssHeight: parseFloat(style.height),
    }
  })
  expect(sizes.backingWidth).toBe(sizes.cssWidth)
  expect(sizes.backingHeight).toBe(sizes.cssHeight)
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

async function resizeTo(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size)
  await expect
    .poll(async () => (await boxOf(viewportRegion(page))).width)
    .toBeLessThanOrEqual(size.width)
  await expectBackingStoreIsCssSize(page)
}

test.describe('the canvas fits the viewport region', () => {
  for (const size of [WINDOW_NOMINAL, WINDOW_SHORT]) {
    test(`lies inside the Viewport region with one backing pixel per CSS pixel at ${size.width}x${size.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(size)
      await gotoEditor(page)
      await expectCanvasInsideViewportRegion(page)
      await expectBackingStoreIsCssSize(page)
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
      await expectNoScroll(page)

      await selectors.planCanvas(page).click({ position: EMPTY_POINT })
      await expectNoScroll(page)

      await selectors.planCanvas(page).evaluate((el) => el.scrollIntoView())
      await expectNoScroll(page)
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
  await expectBackingStoreIsCssSize(page)

  const pane = selectors
    .planCanvas(page)
    .locator('xpath=ancestor::*[contains(@class, "view-mode-viewport__pane")]')
  const scroll = await pane.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }))
  expect(scroll.scrollWidth).toBe(scroll.clientWidth)
  expect(scroll.scrollHeight).toBe(scroll.clientHeight)
  const paneBox = await boxOf(pane)
  const canvas = await canvasBox(page)
  expect(canvas.x + canvas.width).toBeLessThanOrEqual(paneBox.x + paneBox.width + 1)
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
  await expectBackingStoreIsCssSize(page)
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
  await expectBackingStoreIsCssSize(page)
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
    const box = await boxOf(proxy)
    expect(box.x).toBeGreaterThanOrEqual(canvas.x)
    expect(box.y).toBeGreaterThanOrEqual(canvas.y)
    expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width)
    expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height)
  }
})

test('keeps the canvas visible at the minimum size and the floors navigation in view at 1280x380', async ({
  page,
}) => {
  await page.setViewportSize(WINDOW_TINY)
  await gotoEditor(page)
  const canvas = selectors.planCanvas(page)
  await expect(canvas).toBeVisible()
  const box = await boxOf(canvas)
  expect(box.width).toBeGreaterThanOrEqual(MIN_STAGE.width)
  expect(box.height).toBeGreaterThanOrEqual(MIN_STAGE.height)
  await expect(page.getByRole('navigation', { name: 'Floors' })).toBeInViewport()
})

test('records the measured stage size in plan and split mode at 1280x720', async ({ page }) => {
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
