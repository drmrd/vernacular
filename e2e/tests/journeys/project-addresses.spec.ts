import { test, expect, type Page } from '@playwright/test'
import {
  addressFragment,
  drawWall,
  drawWallAndWaitForSave,
  expectProjectAddress,
  expectWallCount,
  gotoEditor,
  projectIdOfAddress,
  selectors,
  startNewProject,
} from './support'

// A project gets an address of its own, `#/project/<id>`, once it is first saved. A reload
// at that address opens the same project, and Back and Forward move between the projects of
// the tab's history, each with what it holds: the first has one wall, the second two. The
// Projects page takes part in that history too.

const DEFAULT_NAME = 'Untitled project'

async function drawTwoWallsAndWaitForSave(page: Page): Promise<void> {
  await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })
  await drawWall(page, { x: 120, y: 320 }, { x: 520, y: 320 })
  await expectWallCount(page, 2)
  await expect(selectors.savedStatus(page)).toBeVisible()
}

async function expectProjectShown(page: Page, id: string, walls: number): Promise<void> {
  await expectProjectAddress(page, id)
  await expect(selectors.planCanvas(page)).toBeVisible()
  await expectWallCount(page, walls)
}

test('reloads on a project address and follows Back and Forward across two projects and the Projects page', async ({
  page,
}) => {
  await gotoEditor(page)
  await drawWallAndWaitForSave(page)
  const firstId = await projectIdOfAddress(page)

  await page.reload()
  await expectProjectShown(page, firstId, 1)

  await startNewProject(page)
  await expect.poll(() => addressFragment(page)).toBe('')
  await drawTwoWallsAndWaitForSave(page)
  const secondId = await projectIdOfAddress(page)
  expect(secondId).not.toBe(firstId)

  await page.goBack()
  await expectProjectShown(page, firstId, 1)

  await page.goForward()
  await expectProjectShown(page, secondId, 2)

  await page.reload()
  await expectProjectShown(page, secondId, 2)

  // The Projects page is a place of its own in the history: Back from it returns to the
  // project, Forward shows the page again, and "Back to" the project leaves the page.
  await page.evaluate(() => {
    window.location.hash = '#/projects'
  })
  const projects = selectors.projectsPage(page)
  await expect(projects).toBeVisible()
  await expect(selectors.planCanvas(page)).toHaveCount(0)

  await page.goBack()
  await expectProjectShown(page, secondId, 2)

  await page.goForward()
  await expect(projects).toBeVisible()
  await expect(selectors.planCanvas(page)).toHaveCount(0)

  await projects.getByRole('button', { name: `Back to ${DEFAULT_NAME}` }).click()
  await expectProjectShown(page, secondId, 2)
})
