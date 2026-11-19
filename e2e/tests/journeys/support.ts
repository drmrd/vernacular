import { expect, type Page } from '@playwright/test'

// Every app selector the journeys depend on lives here, so that when a later
// makeover slice restyles the shell only this module changes, not each spec.
export const selectors = {
  planCanvas: (page: Page) => page.getByLabel('Floor plan'),
  savedStatus: (page: Page) => page.getByText('All changes saved'),
  tool: (page: Page, name: string) => page.getByRole('button', { name }),
  // The top bar renders icon undo/redo buttons and the command bar renders its own,
  // so two buttons share each name; the toolbar icon button is the first in the DOM.
  undoButton: (page: Page) => page.getByRole('button', { name: 'Undo' }).first(),
  redoButton: (page: Page) => page.getByRole('button', { name: 'Redo' }).first(),
  wallProxy: (page: Page) => page.getByRole('option', { name: /^Wall,/ }),
  wallProxies: (page: Page) => page.getByRole('option', { name: /^Wall,/ }),
  roomProxies: (page: Page) => page.getByRole('option', { name: /^Room,/ }),
  dimensionProxies: (page: Page) => page.getByRole('option', { name: /^Dimension,/ }),
  addFloorButton: (page: Page) => page.getByRole('button', { name: 'Add floor' }),
  floorButton: (page: Page, name: string) => page.getByRole('button', { name }),
  selectTool: (page: Page) => page.getByRole('radio', { name: 'Select' }),
  threeDRegion: (page: Page) => page.getByLabel('3D preview'),
  viewModeButton: (page: Page, name: string) => page.getByRole('button', { name }),
  liveRegion: (page: Page) => page.locator('.plan-overlay__live'),
  drawReadout: (page: Page) => page.locator('.plan-overlay__readout'),
}

// Wait until every web font that the page asked for has loaded or failed. The editor
// loads its fonts with display swap, so a face that arrives late is swapped in after
// the first paint. Where the fallback face is wider (the linux runner), the header wraps
// to a second row until the swap, then the plan canvas jumps up under a pointer action.
// `document.fonts.ready` also resolves when a load fails, so this never hangs offline.
export async function webFontsSettled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}

// Boot the assembled editor at its root and wait for the plan canvas and the web fonts.
export async function gotoEditor(page: Page): Promise<void> {
  await page.goto('/')
  await expect(selectors.planCanvas(page)).toBeVisible()
  await webFontsSettled(page)
}

// The plan canvas bounding box, or a thrown error when it has none, so drags and
// clicks can resolve their screen coordinates against it.
export async function canvasBox(page: Page) {
  const box = await selectors.planCanvas(page).boundingBox()
  if (box === null) {
    throw new Error('plan canvas has no bounding box')
  }
  return box
}

// A point on the plan canvas in page coordinates, from the canvas box read now. Aim a raw
// pointer action with this just before it, so that an earlier box can never be stale.
export async function canvasPoint(
  page: Page,
  at: { x: number; y: number },
): Promise<{ x: number; y: number }> {
  const box = await canvasBox(page)
  return { x: box.x + at.x, y: box.y + at.y }
}

// Activate the wall-drawing tool. Drawing is an explicit tool choice now that
// Select (drag-to-pan) is the default (ADR-0069), so a draw must select it first.
export async function selectWallTool(page: Page): Promise<void> {
  await page.getByRole('radio', { name: 'Wall', exact: true }).click()
}

// Draw a single straight wall by clicking a start and an end point on the plan.
export async function drawWall(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await selectWallTool(page)
  const canvas = selectors.planCanvas(page)
  await canvas.click({ position: from })
  await canvas.click({ position: to })
  await page.keyboard.press('Enter')
}

// Assert the plan exposes the given number of walls. The wall count is observed
// through the accessibility entity proxies (one "Wall, <length>" option per wall),
// the durable observable now that the debug wall-count readout is gone.
export async function expectWallCount(page: Page, count: number): Promise<void> {
  await expect(selectors.wallProxies(page)).toHaveCount(count)
}
