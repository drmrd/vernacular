import { test, expect, type Page } from '@playwright/test'
import {
  drawTwoWallsAndWaitForSave,
  drawWallAndWaitForSave,
  expectProjectAddress,
  expectWallCount,
  gotoEditor,
  projectIdOfAddress,
  reloadByScript,
  selectors,
} from './support'

// Two projects live side by side in one browser: the first has one wall, the second two.
// Both keep the default name, so each is told apart by its address and by its walls. The
// second is made from the Projects page, the first is opened again from its card, and a
// reload opens the same project. Back and Forward then walk the entries made before the reload,
// across both projects and the page, and each step shows the project or the page that it should,
// with its walls.

async function showProjectsPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = '#/projects'
  })
  await expectProjectsPageShown(page)
}

async function expectProjectsPageShown(page: Page): Promise<void> {
  await expect(selectors.projectsPage(page)).toBeVisible()
  await expect(selectors.planCanvas(page)).toHaveCount(0)
}

async function expectProjectShown(page: Page, id: string, walls: number): Promise<void> {
  await expectProjectAddress(page, id)
  await expect(selectors.planCanvas(page)).toBeVisible()
  await expectWallCount(page, walls)
}

test('keeps two projects across a switch from the page, a reload, and the history', async ({
  page,
}) => {
  await gotoEditor(page)
  await drawWallAndWaitForSave(page)
  const firstId = await projectIdOfAddress(page)

  await showProjectsPage(page)
  await selectors.projectsPage(page).getByRole('button', { name: 'New project' }).click()
  await expect(selectors.planCanvas(page)).toBeVisible()
  await drawTwoWallsAndWaitForSave(page)
  const secondId = await projectIdOfAddress(page)
  expect(secondId).not.toBe(firstId)

  await showProjectsPage(page)
  await selectors.projectCardLink(page, firstId).click()
  await expectProjectShown(page, firstId, 1)

  // The reload is by script: Playwright's `page.reload()` adds an entry to the history in
  // Firefox, and the Back and Forward steps below walk the entries made before the reload.
  await reloadByScript(page)
  await expectProjectShown(page, firstId, 1)

  await page.goBack()
  await expectProjectsPageShown(page)

  await page.goBack()
  await expectProjectShown(page, secondId, 2)

  await page.goBack()
  await expectProjectsPageShown(page)

  await page.goBack()
  await expectProjectShown(page, firstId, 1)

  await page.goForward()
  await expectProjectsPageShown(page)

  await page.goForward()
  await expectProjectShown(page, secondId, 2)

  await page.goForward()
  await expectProjectsPageShown(page)

  await page.goForward()
  await expectProjectShown(page, firstId, 1)
})
