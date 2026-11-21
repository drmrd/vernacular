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
} from './journeys/support'

// The address of a page names a project, and a link can carry any text. A malformed or
// hostile address opens the start and reaches no store. A well-formed id that this browser
// does not hold says so and stores nothing. The page of projects shows over an open project
// without closing it, the address of a project keeps the path and the query of the page, and
// a reload at that address opens the project with no page of projects in between.

const NOT_STORED = 'This project is not stored in this browser.'
const DEFAULT_NAME = 'Untitled project'
// An id far longer than any id that a project can have.
const OVERLONG_ID_LENGTH = 200
const HOSTILE_ADDRESSES = [
  '#/project/../x',
  '#/project/a%2Fb',
  '#/project/a/b',
  `#/project/${'a'.repeat(OVERLONG_ID_LENGTH)}`,
]
const UNKNOWN_ID = 'no-such-project'
const PAGES_SHOWN = 'main[aria-label="Projects"], main[aria-label="Error"]'

// Loads the page anew at the given query and fragment. A move from a blank page is a full load,
// never a move inside the history of the application.
async function loadAt(page: Page, query: string, fragment: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`/${query}${fragment}`)
}

async function expectStartShown(page: Page): Promise<void> {
  await expect(selectors.planCanvas(page)).toBeVisible()
  await expect.poll(() => addressFragment(page)).toBe('')
}

// Records the name of every page of projects or error that is added to the document, from the
// first parse of each load on, also one that is removed before anyone could look.
function recordPagesShown(selector: string): void {
  const shown: string[] = []
  Object.assign(window, { pagesShown: shown })
  const noteAdded = (node: Node): void => {
    if (!(node instanceof Element)) return
    const pages = node.matches(selector) ? [node] : [...node.querySelectorAll(selector)]
    shown.push(...pages.map((element) => element.getAttribute('aria-label') ?? ''))
  }
  new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach(noteAdded))
  }).observe(document, { childList: true, subtree: true })
}

test.describe('opens the start for a hostile address and stores nothing', () => {
  test('shows the editor and an empty address', async ({ page }) => {
    for (const fragment of HOSTILE_ADDRESSES) {
      await loadAt(page, '', fragment)
      await expectStartShown(page)
    }
  })

  test('leaves no project folder in the store', async ({ page, browserName }) => {
    // WebKit does not support createWritable on OPFS handles from the main thread,
    // so the storage hook cannot read the stored projects there (same limitation as
    // durable-storage).
    test.skip(browserName === 'webkit', 'WebKit lacks main-thread OPFS createWritable')

    for (const fragment of HOSTILE_ADDRESSES) {
      await loadAt(page, '?e2e-storage', fragment)
      await expectStartShown(page)
    }
    await page.waitForFunction(() => window.vernacularE2eStorage !== undefined)
    expect(await page.evaluate(() => window.vernacularE2eStorage!.storedProjectIds())).toEqual([])
  })
})

test('says that a project of an unknown address is not stored, and stores nothing', async ({
  page,
}) => {
  await loadAt(page, '', `#/project/${UNKNOWN_ID}`)
  const projects = selectors.projectsPage(page)
  await expect(projects.getByRole('alert')).toHaveText(NOT_STORED)
  await expect(selectors.planCanvas(page)).toHaveCount(0)

  await projects.getByRole('button', { name: 'New project' }).click()
  await expect(selectors.planCanvas(page)).toBeVisible()

  // The address still names no stored project: the failed open stored nothing under it.
  await loadAt(page, '', `#/project/${UNKNOWN_ID}`)
  await expect(selectors.projectsPage(page).getByRole('alert')).toHaveText(NOT_STORED)
})

test('shows the page over the open project and returns to it with its unsaved wall', async ({
  page,
}) => {
  await gotoEditor(page)
  await drawWallAndWaitForSave(page)
  const id = await projectIdOfAddress(page)
  await drawWall(page, { x: 120, y: 320 }, { x: 520, y: 320 })
  await expectWallCount(page, 2)

  await page.evaluate(() => {
    window.location.hash = '#/projects'
  })
  const projects = selectors.projectsPage(page)
  await expect(selectors.projectCard(page, DEFAULT_NAME)).toBeVisible()
  await expect(selectors.planCanvas(page)).toHaveCount(0)

  await projects.getByRole('button', { name: `Back to ${DEFAULT_NAME}` }).click()
  await expect(selectors.planCanvas(page)).toBeVisible()
  await expectWallCount(page, 2)
  await expectProjectAddress(page, id)
})

test('keeps the query of the page when the address of a project appears', async ({ page }) => {
  await page.goto('/?e2e-storage')
  await expect(selectors.planCanvas(page)).toBeVisible()
  await drawWallAndWaitForSave(page)
  const id = await projectIdOfAddress(page)

  const address = new URL(page.url())
  expect(address.pathname).toBe('/')
  expect(address.search).toBe('?e2e-storage')
  expect(address.hash).toBe(`#/project/${id}`)
})

test('reloads into the same project with no project list in between', async ({ page }) => {
  await gotoEditor(page)
  await drawWallAndWaitForSave(page)
  const id = await projectIdOfAddress(page)

  await page.addInitScript(recordPagesShown, PAGES_SHOWN)
  await page.reload()
  await expect(selectors.planCanvas(page)).toBeVisible()
  await expectWallCount(page, 1)
  await expectProjectAddress(page, id)
  expect(
    await page.evaluate(() => (window as unknown as { pagesShown: string[] }).pagesShown),
  ).toEqual([])
})
