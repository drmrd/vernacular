import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { drawWall, expectWallCount, gotoEditor, selectors } from './journeys/support'

// A project is open in one tab at a time. This spec opens the editor in one tab and
// then in a second tab of the same browser context, so both share storage and locks.
// The second tab must refuse to open the project and show no plan, and the work of
// the first tab must be what is stored, and what comes back after a reload.

const OPEN_IN_OTHER_TAB = 'This project is open in another tab.'

interface Tabs {
  first: Page
  second: Page
}

async function openFirstTabThenSecondTab(context: BrowserContext): Promise<Tabs> {
  const first = await context.newPage()
  await gotoEditor(first)

  const second = await context.newPage()
  await second.goto('/')
  return { first, second }
}

async function drawWallAndWaitForSave(page: Page): Promise<void> {
  await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })
  await expectWallCount(page, 1)
  await expect(selectors.savedStatus(page)).toBeVisible()
}

async function storedFilesOfProject(context: BrowserContext): Promise<Record<string, string>> {
  const page = await context.newPage()
  await page.goto('/?e2e-storage')
  await page.waitForFunction(() => window.vernacularE2eStorage !== undefined)
  return page.evaluate(() => window.vernacularE2eStorage!.storedFilesOfDefaultProject())
}

const STORED_DOCUMENT = 'current/vernacular.json'

function wallsOfGroundFloor(files: Record<string, string>): unknown[] {
  const documentText = files[STORED_DOCUMENT]
  if (documentText === undefined) {
    throw new Error(`${STORED_DOCUMENT} is not stored`)
  }
  const document: { floors: { walls: unknown[] }[] } = JSON.parse(documentText)
  const groundFloor = document.floors[0]
  return groundFloor === undefined ? [] : groundFloor.walls
}

test.describe('A second tab', () => {
  test('cannot open a project that the first tab holds, and the first tab keeps its work', async ({
    context,
  }) => {
    const { first, second } = await openFirstTabThenSecondTab(context)

    const failure = second.getByRole('main', { name: 'Error' })
    await expect(failure.getByRole('alert')).toHaveText(OPEN_IN_OTHER_TAB)
    await expect(selectors.planCanvas(second)).toHaveCount(0)

    await drawWallAndWaitForSave(first)

    await first.reload()
    await expect(selectors.planCanvas(first)).toBeVisible()
    await expectWallCount(first, 1)
    await expect(first.getByText(/Unsaved changes were recovered/i)).toHaveCount(0)
  })

  test('leaves exactly what the first tab drew in storage', async ({ context, browserName }) => {
    // WebKit does not support createWritable on OPFS handles from the main thread,
    // so the storage hook cannot read the stored project there (same limitation as
    // durable-storage).
    test.skip(browserName === 'webkit', 'WebKit lacks main-thread OPFS createWritable')

    const { first } = await openFirstTabThenSecondTab(context)
    await drawWallAndWaitForSave(first)

    const files = await storedFilesOfProject(context)
    expect(Object.keys(files)).toContain(STORED_DOCUMENT)
    expect(wallsOfGroundFloor(files)).toHaveLength(1)
  })
})
