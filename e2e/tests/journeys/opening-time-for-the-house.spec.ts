import { test, expect, type Page } from '@playwright/test'
import { gotoEditor, selectors, selectWallTool } from './support'

// A project opens at a time chosen for its house: the minute at which the front takes the sun.
// A house whose front faces plan-down is south-facing while north is up, and it opens at 10:30.
// Turning north a quarter turn moves that front to the west, and the same house opens at 14:00.
// The journey draws one closed room, which has no door and so a plan-down front, sets the north
// bearing in the Site panel, reloads, and reads the opening time off the Environment panel.

const NORTH_BEARING_DEGREES = '90'
const OPENING_TIME_NORTH_UP = '2026-03-20 10:30'
const OPENING_TIME_WEST_FRONT = '2026-03-20 14:00'
// The panel writes the observation as "YYYY-MM-DD HH:MM".
const OBSERVATION_DATE_TIME_SHAPE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/

const ROOM_LEFT = 200
const ROOM_RIGHT = 500
const ROOM_TOP = 150
const ROOM_BOTTOM = 400

// The closed room that the journeys share, closed by clicking back on the first corner.
async function drawClosedRoom(page: Page): Promise<void> {
  await selectWallTool(page)
  const canvas = selectors.planCanvas(page)
  await canvas.click({ position: { x: ROOM_LEFT, y: ROOM_TOP } })
  await canvas.click({ position: { x: ROOM_RIGHT, y: ROOM_TOP } })
  await canvas.click({ position: { x: ROOM_RIGHT, y: ROOM_BOTTOM } })
  await canvas.click({ position: { x: ROOM_LEFT, y: ROOM_BOTTOM } })
  await canvas.click({ position: { x: ROOM_LEFT, y: ROOM_TOP } })
  await expect(selectors.roomProxies(page)).toHaveCount(1)
}

// The date and time that the Environment panel shows under "Observation date and time".
function observationDateTime(page: Page) {
  return page
    .getByRole('region', { name: /environment/i })
    .getByRole('status')
    .filter({ hasText: OBSERVATION_DATE_TIME_SHAPE })
}

test('opens a house whose front faces west at the time its front takes the sun', async ({
  page,
}) => {
  await gotoEditor(page)
  await drawClosedRoom(page)
  await expect(selectors.savedStatus(page)).toBeVisible()
  await expect(observationDateTime(page)).toHaveText(OPENING_TIME_NORTH_UP)

  const northBearing = page
    .getByRole('region', { name: /site/i })
    .getByLabel('North bearing (degrees)')
  await northBearing.fill(NORTH_BEARING_DEGREES)
  await northBearing.press('Enter')
  await expect(selectors.savedStatus(page)).toBeVisible()

  await page.reload()

  await expect(selectors.planCanvas(page)).toBeVisible()
  await expect(selectors.roomProxies(page)).toHaveCount(1)
  await expect(observationDateTime(page)).toHaveText(OPENING_TIME_WEST_FRONT)
})
