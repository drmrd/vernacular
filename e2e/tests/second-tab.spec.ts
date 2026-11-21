import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import {
  drawWall,
  drawWallAndWaitForSave,
  expectProjectAddress,
  expectWallCount,
  gotoEditor,
  projectIdOfAddress,
  selectors,
} from './journeys/support'

// A project is open in one tab at a time. This spec opens the editor in one tab, saves a
// wall there, and then opens a second tab of the same browser context, so both share
// storage and locks. The second tab starts in the stored project, at the bare address or
// at the project's own address, and must refuse to open it and show no plan. The work of
// the first tab must be what is stored, and what comes back after a reload.

const OPEN_IN_OTHER_TAB = 'This project is open in another tab.'
const DEFAULT_NAME = 'Untitled project'
const UPPER_FLOOR = '2nd Floor'

// Where the second tab opens: the bare address, or the address of the first tab's project.
type SecondTabAddress = 'bare' | 'project'

interface Tabs {
  first: Page
  second: Page
  firstId: string
}

// The first tab stores its project before the second tab opens: two tabs of an empty
// browser would each start a project of their own.
async function openFirstTabThenSecondTab(
  context: BrowserContext,
  address: SecondTabAddress = 'bare',
): Promise<Tabs> {
  const first = await context.newPage()
  await gotoEditor(first)
  await drawWallAndWaitForSave(first)
  const firstId = await projectIdOfAddress(first)

  const second = await context.newPage()
  await second.goto(address === 'bare' ? '/' : `/#/project/${firstId}`)
  return { first, second, firstId }
}

async function expectRefused(second: Page): Promise<void> {
  const failure = selectors.failureView(second)
  await expect(failure.getByRole('alert')).toHaveText(OPEN_IN_OTHER_TAB)
  await expect(selectors.planCanvas(second)).toHaveCount(0)
}

async function storedFilesOfProject(
  context: BrowserContext,
  id: string,
): Promise<Record<string, string>> {
  const page = await context.newPage()
  await page.goto('/?e2e-storage')
  await page.waitForFunction(() => window.vernacularE2eStorage !== undefined)
  return page.evaluate(
    (projectId) => window.vernacularE2eStorage!.storedFilesOfProject(projectId),
    id,
  )
}

function wallsOfGroundFloor(files: Record<string, string>, storedDocument: string): unknown[] {
  const documentText = files[storedDocument]
  if (documentText === undefined) {
    throw new Error(`${storedDocument} is not stored`)
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

    await expectRefused(second)

    await first.reload()
    await expect(selectors.planCanvas(first)).toBeVisible()
    await expectWallCount(first, 1)
    await expect(first.getByText(/Unsaved changes were recovered/i)).toHaveCount(0)
  })

  test('cannot open the project at its address while the first tab holds it', async ({
    context,
  }) => {
    const { first, second, firstId } = await openFirstTabThenSecondTab(context, 'project')

    await expectRefused(second)
    await expectProjectAddress(second, firstId)
    await expectWallCount(first, 1)
  })

  test('leaves exactly what the first tab drew in storage', async ({ context, browserName }) => {
    // WebKit does not support createWritable on OPFS handles from the main thread,
    // so the storage hook cannot read the stored project there (same limitation as
    // durable-storage).
    test.skip(browserName === 'webkit', 'WebKit lacks main-thread OPFS createWritable')

    const { firstId } = await openFirstTabThenSecondTab(context)
    const storedDocument = `${firstId}/vernacular.json`

    const files = await storedFilesOfProject(context, firstId)
    expect(Object.keys(files)).toContain(storedDocument)
    expect(wallsOfGroundFloor(files, storedDocument)).toHaveLength(1)
  })

  test('a project started in the second tab leaves a way back to the first', async ({
    context,
  }) => {
    const { first, second } = await openFirstTabThenSecondTab(context)

    const failure = selectors.failureView(second)
    await expect(failure.getByRole('alert')).toHaveText(OPEN_IN_OTHER_TAB)
    await failure.getByRole('button', { name: 'Start a new project' }).click()
    await expect(selectors.planCanvas(second)).toBeVisible()
    await selectors.addFloorButton(second).click()
    await expect(selectors.floorButton(second, UPPER_FLOOR)).toBeVisible()
    await expect(selectors.savedStatus(second)).toBeVisible()

    // A second wall saved in the first tab makes its project the one used last.
    await drawWall(first, { x: 120, y: 320 }, { x: 520, y: 320 })
    await expectWallCount(first, 2)
    await expect(selectors.savedStatus(first)).toBeVisible()
    await first.close()
    await second.close()

    const later = await context.newPage()
    await later.goto('/')
    await expect(selectors.planCanvas(later)).toBeVisible()
    await expectWallCount(later, 2)
    await expect(selectors.floorButton(later, UPPER_FLOOR)).toHaveCount(0)
    await selectors.projectMenu(later).click()
    await expect(selectors.projectMenuItem(later, DEFAULT_NAME)).toHaveCount(1)
  })
})
