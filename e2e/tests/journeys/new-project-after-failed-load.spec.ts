import { test, expect, type Page } from '@playwright/test'
import { selectors } from './support'

// A stored project this build cannot open shows the Projects page, with a notice and a card that
// says the project did not open. Starting a new project from it must store the new one separately:
// after an edit and a save, a reload opens the new project, and every stored file of the old one
// is unchanged.
// The old project is planted and read through the query-parameter-guarded hook
// installed by src/e2e-storage-hook.ts.

const DID_NOT_OPEN_TEXT = 'This project did not open.'
// The id that the hook plants the project of a newer build under.
const PLANTED_ID = 'current'

async function openStorageHook(page: Page): Promise<void> {
  await page.goto('/?e2e-storage')
  await page.waitForFunction(() => window.vernacularE2eStorage !== undefined)
}

async function storedFilesOfOldProject(page: Page): Promise<Record<string, string>> {
  await openStorageHook(page)
  return page.evaluate((id) => window.vernacularE2eStorage!.storedFilesOfProject(id), PLANTED_ID)
}

test('starts a new project after a failed load and keeps the saved one unchanged', async ({
  page,
  browserName,
}) => {
  // WebKit does not support createWritable on OPFS handles from the main thread,
  // so it cannot write the planted project (same limitation as durable-storage).
  test.skip(browserName === 'webkit', 'WebKit lacks main-thread OPFS createWritable')

  await openStorageHook(page)
  const planted = await page.evaluate(() =>
    window.vernacularE2eStorage!.plantProjectFromNewerBuild(),
  )
  expect(planted).toBe(true)
  const before = await storedFilesOfOldProject(page)
  expect(Object.keys(before)).toContain(`${PLANTED_ID}/vernacular.json`)

  await page.goto('/')
  const projects = selectors.projectsPage(page)
  await expect(projects.getByRole('alert')).toContainText('Could not open the project')
  await expect(projects.getByText(DID_NOT_OPEN_TEXT)).toBeVisible()
  await projects.getByRole('button', { name: 'New project' }).click()

  await expect(selectors.planCanvas(page)).toBeVisible()
  await selectors.addFloorButton(page).click()
  await expect(selectors.floorButton(page, '2nd Floor')).toBeVisible()
  await expect(selectors.savedStatus(page)).toBeVisible()

  await page.reload()
  await expect(selectors.planCanvas(page)).toBeVisible()
  await expect(selectors.floorButton(page, '2nd Floor')).toBeVisible()
  await expect(selectors.projectsPage(page)).toHaveCount(0)

  expect(await storedFilesOfOldProject(page)).toEqual(before)
})
