import { test, expect, type Page } from '@playwright/test'
import { drawWall, expectWallCount, gotoEditor, selectors } from './support'

// A browser with neither IndexedDB nor the origin private file system keeps no project after the
// tab closes. The editor still opens on a project made in memory, the banner says that the
// projects last until the tab closes, the status says that an edit is held by the tab alone, and
// the Projects page shows the same banner and a card that says the same.

const BANNER_WITH_FOLDERS =
  'This browser is not keeping your projects. They last until this tab closes. To keep one, export it, or open a folder.'
const BANNER_WITHOUT_FOLDERS =
  'This browser is not keeping your projects. They last until this tab closes. To keep one, export it.'
const TAB_ONLY_CARD_TEXT = 'In this tab only.'

// Removes both ways to keep a project before any script of the application runs.
function removeEveryStore(): void {
  Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true })
  Object.defineProperty(StorageManager.prototype, 'getDirectory', {
    value: undefined,
    configurable: true,
  })
}

// The banner reads the clause about folders only where the browser offers folder access.
async function bannerOfThisBrowser(page: Page): Promise<string> {
  const offersFolders = await page.evaluate(() => typeof window.showDirectoryPicker === 'function')
  return offersFolders ? BANNER_WITH_FOLDERS : BANNER_WITHOUT_FOLDERS
}

async function showProjectsPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = '#/projects'
  })
  await expect(selectors.projectsPage(page)).toBeVisible()
}

test('says that projects stay in this tab in a browser that keeps none', async ({ page }) => {
  await page.addInitScript(removeEveryStore)
  await gotoEditor(page)
  const banner = await bannerOfThisBrowser(page)
  await expect(selectors.storageBanner(page).getByText(banner, { exact: true })).toBeVisible()

  await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })

  await expectWallCount(page, 1)
  await expect(selectors.tabOnlyStatus(page)).toBeVisible()
  await expect(selectors.savedStatus(page)).toHaveCount(0)

  await showProjectsPage(page)

  await expect(selectors.storageBanner(page).getByText(banner, { exact: true })).toBeVisible()
  await expect(
    selectors.projectsPage(page).getByText(TAB_ONLY_CARD_TEXT, { exact: true }),
  ).toBeVisible()
})
