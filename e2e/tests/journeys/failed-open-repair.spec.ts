import { test, expect, type Page } from '@playwright/test'
import { selectors } from './support'

// A stored project whose two paint entries mix two kinds does not open, and the dialog at the start
// offers a repair. "Open with the repair" and then "Open as a new project" open a repaired copy
// under its own name and leave the stored project as it was: after a reload the Projects page has
// two cards, and every stored file of the first project holds the planted bytes.
// The project is planted and read through the query-parameter-guarded hook installed by
// src/e2e-storage-hook.ts.

const REPAIR_INTRODUCTION = 'A repair can open this project.'
const PAINT_REPAIR_SENTENCE = 'It removes the extra data from 2 paint entries.'
const REPAIRED_COPY_NAME = 'Mixed Paint House (repaired copy)'
const PROJECTS_PAGE_ADDRESS = '#/projects'
const CARD_COUNT_AFTER_THE_COPY = 2

async function openStorageHook(page: Page): Promise<void> {
  await page.goto('/?e2e-storage')
  await page.waitForFunction(() => window.vernacularE2eStorage !== undefined)
}

async function plantTheProject(page: Page): Promise<string> {
  await openStorageHook(page)
  return page.evaluate(() => window.vernacularE2eStorage!.plantProjectWithMixedPaintEntries())
}

async function storedFilesOf(page: Page, id: string): Promise<Record<string, string>> {
  await openStorageHook(page)
  return page.evaluate(
    (projectId) => window.vernacularE2eStorage!.storedFilesOfProject(projectId),
    id,
  )
}

test('opens a repaired copy of a project that did not open and keeps the stored project unchanged', async ({
  page,
  browserName,
}) => {
  // WebKit does not support createWritable on OPFS handles from the main thread,
  // so it cannot write the planted project (same limitation as durable-storage).
  test.skip(browserName === 'webkit', 'WebKit lacks main-thread OPFS createWritable')

  const plantedId = await plantTheProject(page)
  const before = await storedFilesOf(page, plantedId)
  expect(Object.keys(before)).toContain(`${plantedId}/vernacular.json`)

  await page.goto('/')
  const dialog = selectors.failedOpenDialog(page)
  await expect(dialog).toContainText(REPAIR_INTRODUCTION)
  await expect(dialog).toContainText(PAINT_REPAIR_SENTENCE)
  await dialog.getByRole('button', { name: 'Open with the repair' }).click()

  await selectors
    .repairChoiceDialog(page)
    .getByRole('button', { name: 'Open as a new project' })
    .click()
  await expect(selectors.planCanvas(page)).toBeVisible()
  await expect(selectors.breadcrumb(page)).toContainText(REPAIRED_COPY_NAME)

  await page.reload()
  await expect(selectors.planCanvas(page)).toBeVisible()
  await page.evaluate((address) => {
    window.location.hash = address
  }, PROJECTS_PAGE_ADDRESS)
  await expect(selectors.projectCards(page)).toHaveCount(CARD_COUNT_AFTER_THE_COPY)

  expect(await storedFilesOf(page, plantedId)).toEqual(before)
})
