import { test, expect, type Page } from '@playwright/test'
import {
  chooseFromProjectMenu,
  drawWallAndWaitForSave,
  expectWallCount,
  gotoEditor,
  selectors,
} from './support'

// A browser that an older build used holds stored projects but no project index, and that
// build may have remembered the id of its last active project. The start rebuilds the index
// from the stored projects, opens today's project, and starts once in the remembered one,
// whose key it then removes. The second project is planted through the query-parameter-guarded
// hook installed by src/e2e-storage-hook.ts.

const INDEX_DATABASE = 'vernacular-index'
const REMEMBERED_ID_KEY = 'vernacular.activeProjectId'
const PLANTED_ID = 'e2e-persist'
const PLANTED_NAME = 'Persisted House'
const SECOND_FLOOR = '2nd Floor'
const UNTITLED_NAME = 'Untitled project'

// Deletes the project index database of the page's origin and resolves once it is gone.
async function deleteIndexDatabase(page: Page): Promise<void> {
  await page.evaluate(
    (name) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error ?? new Error(`${name} was not deleted`))
      }),
    INDEX_DATABASE,
  )
}

async function openStorageHook(page: Page): Promise<void> {
  await page.goto('/?e2e-storage')
  await page.waitForFunction(() => window.vernacularE2eStorage !== undefined)
}

function rememberedId(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), REMEMBERED_ID_KEY)
}

// The test opens a second project and changes it last: only a rebuild of the index makes the start
// open that one. The page loads again at the bare address, because a load at the address of a
// project opens that project whatever the index holds.
test("opens today's project when the browser holds no index", async ({ page }) => {
  await gotoEditor(page)
  await drawWallAndWaitForSave(page)
  await chooseFromProjectMenu(page, 'New project')
  await expectWallCount(page, 0)
  await selectors.addFloorButton(page).click()
  await expect(selectors.floorButton(page, SECOND_FLOOR)).toBeVisible()
  await expect(selectors.savedStatus(page)).toBeVisible()

  await deleteIndexDatabase(page)
  await page.goto('/')

  await expect(selectors.planCanvas(page)).toBeVisible()
  await expect(selectors.floorButton(page, SECOND_FLOOR)).toBeVisible()
  await expectWallCount(page, 0)
  await expect(selectors.failedOpenDialog(page)).toHaveCount(0)
  await selectors.projectMenu(page).click()
  await expect(selectors.projectMenuItem(page, UNTITLED_NAME)).toHaveCount(1)
})

test('starts once in the project that an older build remembered', async ({ page, browserName }) => {
  // WebKit does not support createWritable on OPFS handles from the main thread,
  // so the hook cannot store the second project (same limitation as durable-storage).
  test.skip(browserName === 'webkit', 'WebKit lacks main-thread OPFS createWritable')

  await gotoEditor(page)
  await drawWallAndWaitForSave(page)

  await openStorageHook(page)
  await page.evaluate(() => window.vernacularE2eStorage!.opfsPersistSave())
  // The hook page boots the app, whose index writes could recreate the index after the delete
  // below. A same-origin page that runs no app leaves nothing to write it.
  await page.goto('/favicon.svg')
  await page.evaluate(({ key, id }) => localStorage.setItem(key, id), {
    key: REMEMBERED_ID_KEY,
    id: PLANTED_ID,
  })
  await deleteIndexDatabase(page)

  await page.goto('/')
  await expect(selectors.planCanvas(page)).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveText(PLANTED_NAME)
  await expectWallCount(page, 0)
  await expect(selectors.failedOpenDialog(page)).toHaveCount(0)
  await expect.poll(() => rememberedId(page)).toBeNull()
})
