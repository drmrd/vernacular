import { test, expect, type Page } from '@playwright/test'
import {
  chooseFromProjectMenu,
  drawWallAndWaitForSave,
  expectWallCount,
  gotoEditor,
  selectors,
  startNewProject,
} from './support'

// The Project menu lists the stored projects used last, apart from the open one, as the
// project index of the browser holds them. A new project has the same default name as the
// first, so a recent row is found by that name and the projects are told apart by what each
// holds: the first has a wall, the second has a second floor. In WebKit the projects live in
// IndexedDB, elsewhere in the origin private file system, so both stores are covered.

const DEFAULT_NAME = 'Untitled project'
const UPPER_FLOOR = '2nd Floor'

async function expectFirstProjectOpen(page: Page): Promise<void> {
  await expect(selectors.planCanvas(page)).toBeVisible()
  await expectWallCount(page, 1)
  await expect(selectors.floorButton(page, UPPER_FLOOR)).toHaveCount(0)
}

// Opens the Project menu and expects exactly one recent row, then closes the menu again.
async function expectOneRecentProject(page: Page): Promise<void> {
  await selectors.projectMenu(page).click()
  await expect(selectors.projectMenuItem(page, DEFAULT_NAME)).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(selectors.projectMenuItem(page, 'New project')).toHaveCount(0)
}

test('switches between two stored projects from the recent list', async ({ page }) => {
  await gotoEditor(page)
  await drawWallAndWaitForSave(page)

  await startNewProject(page)
  await expectWallCount(page, 0)
  await selectors.addFloorButton(page).click()
  await expect(selectors.floorButton(page, UPPER_FLOOR)).toBeVisible()
  await expect(selectors.savedStatus(page)).toBeVisible()

  await expectOneRecentProject(page)
  await chooseFromProjectMenu(page, DEFAULT_NAME)
  await expectFirstProjectOpen(page)

  await expectOneRecentProject(page)

  await page.reload()
  await expectFirstProjectOpen(page)
})

test('lists no project that was never saved', async ({ page }) => {
  await gotoEditor(page)
  await drawWallAndWaitForSave(page)

  await startNewProject(page)
  await startNewProject(page)

  // Of the three projects only the first was ever stored, so it is the one recent row.
  await expectOneRecentProject(page)
  await chooseFromProjectMenu(page, DEFAULT_NAME)
  await expectFirstProjectOpen(page)
})
