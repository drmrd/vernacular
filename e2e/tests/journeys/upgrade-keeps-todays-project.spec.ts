import { test, expect, type Page } from '@playwright/test'
import { drawWall, expectWallCount, gotoEditor, selectors } from './support'

// A browser that an older build used holds stored projects but no project index, and that
// build may have remembered the id of its last active project. The start rebuilds the index
// from the stored projects, opens today's project, and starts once in the remembered one,
// whose key it then removes. The second project is planted through the query-parameter-guarded
// hook installed by src/e2e-storage-hook.ts.

const INDEX_DATABASE = 'vernacular-index'
const REMEMBERED_ID_KEY = 'vernacular.activeProjectId'
const PLANTED_ID = 'e2e-persist'
const PLANTED_NAME = 'Persisted House'

async function drawWallAndWaitForSave(page: Page): Promise<void> {
  await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })
  await expectWallCount(page, 1)
  await expect(selectors.savedStatus(page)).toBeVisible()
}

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

test("opens today's project when the browser holds no index", async ({ page }) => {
  await gotoEditor(page)
  await drawWallAndWaitForSave(page)

  await deleteIndexDatabase(page)
  await page.reload()

  await expect(selectors.planCanvas(page)).toBeVisible()
  await expectWallCount(page, 1)
  await expect(selectors.failureView(page)).toHaveCount(0)
})

test('starts once in the project that an older build remembered', async ({ page, browserName }) => {
  // WebKit does not support createWritable on OPFS handles from the main thread,
  // so the hook cannot store the second project (same limitation as durable-storage).
  test.skip(browserName === 'webkit', 'WebKit lacks main-thread OPFS createWritable')

  await gotoEditor(page)
  await drawWallAndWaitForSave(page)

  await openStorageHook(page)
  await page.evaluate(() => window.vernacularE2eStorage!.opfsPersistSave())
  await page.evaluate(({ key, id }) => localStorage.setItem(key, id), {
    key: REMEMBERED_ID_KEY,
    id: PLANTED_ID,
  })
  await deleteIndexDatabase(page)

  await page.goto('/')
  await expect(selectors.planCanvas(page)).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveText(PLANTED_NAME)
  await expectWallCount(page, 0)
  await expect(selectors.failureView(page)).toHaveCount(0)
  await expect.poll(() => rememberedId(page)).toBeNull()
})
