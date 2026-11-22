import { test, expect, type Locator, type Page } from '@playwright/test'
import {
  CLOSED_ROOM,
  drawClosedRoom,
  editAndWaitForTheSave,
  gotoEditor,
  selectors,
} from './support'

// The owner marks one door of a house as its main entrance in the opening inspector, and the
// mark is stored with the project. The journey draws one closed room and places two doors, one on
// its bottom wall, which the guess for the entrance always picks because that wall faces plan-down,
// and one on its top wall. It marks the top door, reloads, and reads the mark off the inspector.

const GUESSED_ENTRANCE_NOTE = 'Vernacular treats this door as the entrance until one is marked.'

const GUESSED_DOOR_X = 260
const MARKED_DOOR_X = 440

// Opening proxies read through their accessible label, which ends in "wide".
const doorProxies = (page: Page) => page.getByRole('option', { name: / wide$/ })

const mainEntranceCheckbox = (page: Page) => page.getByRole('checkbox', { name: 'Main entrance' })

// Places a door with the Door chip and a click on the wall centerline.
async function placeDoorAt(page: Page, position: { x: number; y: number }): Promise<void> {
  await page.getByRole('radio', { name: 'Door', exact: true }).click()
  await selectors.planCanvas(page).click({ position })
}

// Selects a door by its proxy. The proxy ignores the pointer, so the click is forced and reaches
// the plan canvas beneath it, with the Select tool armed.
async function selectDoor(page: Page, proxy: Locator): Promise<void> {
  await selectors.selectTool(page).click()
  await proxy.click({ force: true })
}

test('keeps the main entrance mark on a door across a reload', async ({ page }) => {
  await gotoEditor(page)
  await drawClosedRoom(page)
  await placeDoorAt(page, { x: GUESSED_DOOR_X, y: CLOSED_ROOM.bottom })
  await placeDoorAt(page, { x: MARKED_DOOR_X, y: CLOSED_ROOM.top })
  await expect(doorProxies(page)).toHaveCount(2)

  await selectDoor(page, doorProxies(page).nth(0))
  await expect(mainEntranceCheckbox(page)).not.toBeChecked()
  await expect(page.getByText(GUESSED_ENTRANCE_NOTE)).toBeVisible()

  await selectDoor(page, doorProxies(page).nth(1))
  await expect(mainEntranceCheckbox(page)).not.toBeChecked()

  await editAndWaitForTheSave(page, () => mainEntranceCheckbox(page).check())

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
