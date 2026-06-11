import { expect, type Page } from '@playwright/test'

// Every app selector the journeys depend on lives here, so that when a later
// makeover slice restyles the shell only this module changes, not each spec.
export const selectors = {
  planCanvas: (page: Page) => page.getByLabel('Floor plan'),
  wallCount: (page: Page, count: number) => page.getByText(`Walls: ${count}`),
  savedStatus: (page: Page) => page.getByText('All changes saved'),
  tool: (page: Page, name: string) => page.getByRole('button', { name }),
  undoButton: (page: Page) => page.getByRole('button', { name: 'Undo' }),
  redoButton: (page: Page) => page.getByRole('button', { name: 'Redo' }),
  wallProxy: (page: Page) => page.getByRole('option', { name: /^Wall,/ }),
  selectTool: (page: Page) => page.getByRole('button', { name: 'Select' }),
}

// Boot the assembled editor at its root and wait for the plan canvas.
export async function gotoEditor(page: Page): Promise<void> {
  await page.goto('/')
  await expect(selectors.planCanvas(page)).toBeVisible()
}

// Draw a single straight wall by clicking a start and an end point on the plan.
export async function drawWall(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const canvas = selectors.planCanvas(page)
  await canvas.click({ position: from })
  await canvas.click({ position: to })
}

// Assert the shell reports the given number of walls.
export async function expectWallCount(page: Page, count: number): Promise<void> {
  await expect(selectors.wallCount(page, count)).toBeVisible()
}
