import { expect, type Locator, type Page } from '@playwright/test'

// The status text that the editor shows from the start of a save until the write ends.
export const SAVING_STATUS_TEXT = 'Saving...'

// Every app selector the journeys depend on lives here, so that when a later
// makeover slice restyles the shell only this module changes, not each spec.
export const selectors = {
  planCanvas: (page: Page) => page.getByLabel('Floor plan'),
  savedStatus: (page: Page) => page.getByText('All changes saved'),
  // What the shell says of a change that only the tab holds. The card of the Projects page says
  // the same with a full stop, so only the whole text without it matches.
  tabOnlyStatus: (page: Page) => page.getByText('In this tab only', { exact: true }),
  // The banner of a browser that keeps no projects, found by its first sentence, since the
  // recovery banner and the page notice are alerts too.
  storageBanner: (page: Page) =>
    page.getByRole('alert').filter({ hasText: 'This browser is not keeping your projects.' }),
  tool: (page: Page, name: string) => page.getByRole('button', { name }),
  // The top bar renders icon undo/redo buttons and the command bar renders its own,
  // so two buttons share each name; the toolbar icon button is the first in the DOM.
  undoButton: (page: Page) => page.getByRole('button', { name: 'Undo' }).first(),
  redoButton: (page: Page) => page.getByRole('button', { name: 'Redo' }).first(),
  wallProxy: (page: Page) => page.getByRole('option', { name: /^Wall,/ }),
  wallProxies: (page: Page) => page.getByRole('option', { name: /^Wall,/ }),
  roomProxies: (page: Page) => page.getByRole('option', { name: /^Room,/ }),
  dimensionProxies: (page: Page) => page.getByRole('option', { name: /^Dimension,/ }),
  addFloorButton: (page: Page) => page.getByRole('button', { name: 'Add floor' }),
  floorButton: (page: Page, name: string) => page.getByRole('button', { name }),
  selectTool: (page: Page) => page.getByRole('radio', { name: 'Select' }),
  threeDRegion: (page: Page) => page.getByLabel('3D preview'),
  viewModeButton: (page: Page, name: string) => page.getByRole('button', { name }),
  liveRegion: (page: Page) => page.locator('.plan-overlay__live'),
  drawReadout: (page: Page) => page.locator('.plan-overlay__readout'),
  projectMenu: (page: Page) => page.getByRole('button', { name: 'Project', exact: true }),
  projectMenuItem: (page: Page, name: string) => page.getByRole('menuitem', { name, exact: true }),
  projectsPage: (page: Page) => page.getByRole('main', { name: 'Projects', exact: true }),
  // A card is the list item that holds the link named after its project.
  projectCard: (page: Page, name: string) =>
    selectors
      .projectsPage(page)
      .getByRole('listitem')
      .filter({ has: page.getByRole('link', { name, exact: true }) }),
  // The link of the card of the project with the given id, for projects that share a name.
  projectCardLink: (page: Page, id: string) =>
    selectors.projectsPage(page).locator(`a[href="#/project/${id}"]`),
  // The "..." control of a card, which opens the menu of the actions of its project.
  cardActionsButton: (page: Page, name: string) =>
    selectors.projectCard(page, name).getByRole('button', { name: `Actions for ${name}` }),
  // The dialog that a project that did not open shows, and the dialog that asks how to open its repair.
  failedOpenDialog: (page: Page) =>
    page.getByRole('alertdialog', { name: 'This project did not open.', exact: true }),
  repairChoiceDialog: (page: Page) =>
    page.getByRole('alertdialog', { name: 'Open the repaired project', exact: true }),
  // The path that names the open project, in the header of the editor.
  breadcrumb: (page: Page) => page.getByRole('navigation', { name: /breadcrumb/i }),
  projectCards: (page: Page) => selectors.projectsPage(page).getByRole('listitem'),
  cardMenuItems: (page: Page) => page.getByRole('menuitem'),
  cardMenuItem: (page: Page, name: string) => page.getByRole('menuitem', { name, exact: true }),
}

// Open the Project menu and choose the row with the given label.
export async function chooseFromProjectMenu(page: Page, label: string): Promise<void> {
  await selectors.projectMenu(page).click()
  await selectors.projectMenuItem(page, label).click()
}

// How long the web fonts get to load before the wait fails. It is shorter than the test
// time limit, so that a stalled font host is reported as such and not as a bare timeout.
export const WEB_FONTS_SETTLE_TIMEOUT_MS = 10_000

// Wait for the editor to draw its first text, then until every web font that the page
// asked for has loaded or failed. The editor loads its fonts with display swap, so a face
// that arrives late is swapped in after the first paint. Where the fallback face is wider
// (the linux runner), the header wraps to a second row until the swap, then the plan
// canvas jumps up under a pointer action. The font loads start only once the editor has
// drawn text, so the canvas is awaited first. `document.fonts.ready` also resolves when a
// load fails, so a failed load ends the wait. A load that stalls fails the wait with a
// message that names the font host once the time limit has passed.
export async function webFontsSettled(
  page: Page,
  timeoutMs: number = WEB_FONTS_SETTLE_TIMEOUT_MS,
): Promise<void> {
  await expect(selectors.planCanvas(page)).toBeVisible()
  const outcome = await page.evaluate(async (limitMs) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const stalled = new Promise<'stalled'>((resolve) => {
      timer = setTimeout(() => resolve('stalled'), limitMs)
    })
    const settled = document.fonts.ready.then(() => 'settled' as const)
    const result = await Promise.race([settled, stalled])
    clearTimeout(timer)
    return result
  }, timeoutMs)
  expect(
    outcome,
    `web fonts still loading after ${timeoutMs} ms: the font host is slow or stalled`,
  ).toBe('settled')
}

// Boot the assembled editor at its root and wait for the plan canvas and the web fonts.
export async function gotoEditor(page: Page): Promise<void> {
  await page.goto('/')
  await webFontsSettled(page)
}

// Reloads the page from a script and waits for the new document and the web fonts. Playwright's
// `page.reload()` adds an entry to the history in Firefox, which `window.location.reload()` does
// not, so a journey that follows Back and Forward past a reload reloads this way.
export async function reloadByScript(page: Page): Promise<void> {
  const loaded = page.waitForEvent('load')
  await page.evaluate(() => window.location.reload())
  await loaded
  await webFontsSettled(page)
}

// The bounding box of a locator, or a thrown error when it has none.
export async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (box === null) {
    throw new Error('the element has no bounding box')
  }
  return box
}

// The plan canvas bounding box, or a thrown error when it has none, so drags and
// clicks can resolve their screen coordinates against it.
export async function canvasBox(page: Page) {
  return boxOf(selectors.planCanvas(page))
}

// A point on the plan canvas in page coordinates, from the canvas box read now. Aim a raw
// pointer action with this just before it, so that an earlier box can never be stale.
export async function canvasPoint(
  page: Page,
  at: { x: number; y: number },
): Promise<{ x: number; y: number }> {
  const box = await canvasBox(page)
  return { x: box.x + at.x, y: box.y + at.y }
}

// Activate the wall-drawing tool. Drawing is an explicit tool choice now that
// Select (drag-to-pan) is the default (ADR-0069), so a draw must select it first.
export async function selectWallTool(page: Page): Promise<void> {
  await page.getByRole('radio', { name: 'Wall', exact: true }).click()
}

// Draw a single straight wall by clicking a start and an end point on the plan.
export async function drawWall(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await selectWallTool(page)
  const canvas = selectors.planCanvas(page)
  await canvas.click({ position: from })
  await canvas.click({ position: to })
  await page.keyboard.press('Enter')
}

// The closed room that the journeys share, in canvas pixels.
export const CLOSED_ROOM = { left: 200, right: 500, top: 150, bottom: 400 }

// Draws the shared closed room, closed by clicking back on the first corner.
export async function drawClosedRoom(page: Page): Promise<void> {
  await selectWallTool(page)
  const canvas = selectors.planCanvas(page)
  const { left, right, top, bottom } = CLOSED_ROOM
  await canvas.click({ position: { x: left, y: top } })
  await canvas.click({ position: { x: right, y: top } })
  await canvas.click({ position: { x: right, y: bottom } })
  await canvas.click({ position: { x: left, y: bottom } })
  await canvas.click({ position: { x: left, y: top } })
  await expect(selectors.roomProxies(page)).toHaveCount(1)
}

// Runs an edit and waits until it is stored. "All changes saved" is already on screen from the
// save of an earlier edit, so it cannot tell the two saves apart. The status shows "Saving..."
// from the edit until the write ends, which is never shorter than the autosave delay. The wait for
// that state starts before the edit, in the page, so it cannot miss the state; the saved text that
// is read after it can only belong to the edit.
export async function editAndWaitForTheSave(page: Page, edit: () => Promise<void>): Promise<void> {
  const saveStarted = page.getByText(SAVING_STATUS_TEXT).waitFor()
  await edit()
  await saveStarted
  await expect(selectors.savedStatus(page)).toBeVisible()
}

// Assert the plan exposes the given number of walls. The wall count is observed
// through the accessibility entity proxies (one "Wall, <length>" option per wall),
// the durable observable now that the debug wall-count readout is gone.
export async function expectWallCount(page: Page, count: number): Promise<void> {
  await expect(selectors.wallProxies(page)).toHaveCount(count)
}

// Draw one wall on a plan that holds none and wait until the project is saved.
export async function drawWallAndWaitForSave(page: Page): Promise<void> {
  await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })
  await expectWallCount(page, 1)
  await expect(selectors.savedStatus(page)).toBeVisible()
}

// Draw two walls on a plan that holds none and wait until the project is saved.
export async function drawTwoWallsAndWaitForSave(page: Page): Promise<void> {
  await drawWall(page, { x: 120, y: 200 }, { x: 520, y: 200 })
  await drawWall(page, { x: 120, y: 320 }, { x: 520, y: 320 })
  await expectWallCount(page, 2)
  await expect(selectors.savedStatus(page)).toBeVisible()
}

// Starts a new project and waits until it shows, unsaved: its status is not the saved one.
export async function startNewProject(page: Page): Promise<void> {
  await chooseFromProjectMenu(page, 'New project')
  await expect(selectors.planCanvas(page)).toBeVisible()
  await expect(selectors.savedStatus(page)).toHaveCount(0)
}

// The fragment of the page address, with its leading `#`, or the empty text when it has none.
export function addressFragment(page: Page): string {
  return new URL(page.url()).hash
}

// The address of a project ends with its id, which only letters, digits, and hyphens make up.
const PROJECT_ADDRESS = /#\/project\/([A-Za-z0-9-]+)$/

// Waits until the page address names a project, and gives the id that it names.
export async function projectIdOfAddress(page: Page): Promise<string> {
  await expect(page).toHaveURL(PROJECT_ADDRESS)
  const id = PROJECT_ADDRESS.exec(page.url())?.[1]
  if (id === undefined) {
    throw new Error(`the address ${page.url()} names no project`)
  }
  return id
}

// Waits until the page address is the address of the project with the given id.
export async function expectProjectAddress(page: Page, id: string): Promise<void> {
  await expect.poll(() => addressFragment(page)).toBe(`#/project/${id}`)
}

// The panel writes the observation as "YYYY-MM-DD HH:MM".
const OBSERVATION_DATE_TIME_SHAPE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/

// The date and time that the Environment panel shows under "Observation date and time".
export function observationDateTime(page: Page) {
  return page
    .getByRole('region', { name: /environment/i })
    .getByRole('status')
    .filter({ hasText: OBSERVATION_DATE_TIME_SHAPE })
}
