import { test, expect, type Locator, type Page } from '@playwright/test'
import { drawClosedRoom, gotoEditor, selectors } from './support'

// The owner marks one door of a house as its main entrance in the opening inspector, and the
// mark is stored with the project. The journey draws one closed room, places two doors well
// apart on its top wall, marks the second, reloads, and reads the mark off the inspector.

const SAVING_STATUS_TEXT = 'Saving...'
const GUESSED_ENTRANCE_NOTE = 'Vernacular treats this door as the entrance until one is marked.'

// The top wall of the closed room runs along y = 150 between x = 200 and x = 500.
const TOP_WALL_Y = 150
const FIRST_DOOR_X = 260
const SECOND_DOOR_X = 440

// Opening proxies read through their accessible label, which ends in "wide".
const doorProxies = (page: Page) => page.getByRole('option', { name: / wide$/ })

const mainEntranceCheckbox = (page: Page) => page.getByRole('checkbox', { name: 'Main entrance' })

// Places a door with the Door chip and a click on the wall centerline.
async function placeDoorAt(page: Page, x: number): Promise<void> {
  await page.getByRole('radio', { name: 'Door', exact: true }).click()
  await selectors.planCanvas(page).click({ position: { x, y: TOP_WALL_Y } })
}

// Selects a door by its proxy. The proxy ignores the pointer, so the click is forced and reaches
// the plan canvas beneath it, with the Select tool armed.
async function selectDoor(page: Page, proxy: Locator): Promise<void> {
  await selectors.selectTool(page).click()
  await proxy.click({ force: true })
}

// Ticks the box and waits until the edit is stored. "All changes saved" is already on screen from
// the save of the doors, so it cannot tell the two saves apart. The wait for "Saving..." starts
// before the click, in the page, so it cannot miss the state.
async function tickMainEntranceAndWaitForTheSave(page: Page): Promise<void> {
  const saveStarted = page.getByText(SAVING_STATUS_TEXT).waitFor()
  await mainEntranceCheckbox(page).check()
  await saveStarted
  await expect(selectors.savedStatus(page)).toBeVisible()
}

test('keeps the main entrance mark on a door across a reload', async ({ page }) => {
  await gotoEditor(page)
  await drawClosedRoom(page)
  await placeDoorAt(page, FIRST_DOOR_X)
  await placeDoorAt(page, SECOND_DOOR_X)
  await expect(doorProxies(page)).toHaveCount(2)

  await selectDoor(page, doorProxies(page).nth(1))
  await expect(mainEntranceCheckbox(page)).not.toBeChecked()

  await tickMainEntranceAndWaitForTheSave(page)

  await page.reload()

  await expect(selectors.planCanvas(page)).toBeVisible()
  await expect(selectors.roomProxies(page)).toHaveCount(1)
  await expect(doorProxies(page)).toHaveCount(2)

  await selectDoor(page, doorProxies(page).nth(1))
  await expect(mainEntranceCheckbox(page)).toBeChecked()

  await selectDoor(page, doorProxies(page).nth(0))
  await expect(mainEntranceCheckbox(page)).not.toBeChecked()
  await expect(page.getByText(GUESSED_ENTRANCE_NOTE)).toHaveCount(0)
})
