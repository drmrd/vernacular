import { test, expect, type Page } from '@playwright/test'
import { drawClosedRoom, editAndWaitForTheSave, gotoEditor, selectors } from './support'

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

// The date and time that the Environment panel shows under "Observation date and time".
function observationDateTime(page: Page) {
  return page
    .getByRole('region', { name: /environment/i })
    .getByRole('status')
    .filter({ hasText: OBSERVATION_DATE_TIME_SHAPE })
}

// Types the bearing and waits until the edit is stored.
async function setNorthBearingAndWaitForTheSave(page: Page, degrees: string): Promise<void> {
  const northBearing = page
    .getByRole('region', { name: /site/i })
    .getByLabel('North bearing (degrees)')
  await editAndWaitForTheSave(page, async () => {
    await northBearing.fill(degrees)
    await northBearing.press('Enter')
  })
}

test('opens a house whose front faces west at the time its front takes the sun', async ({
  page,
}) => {
  await gotoEditor(page)
  await drawClosedRoom(page)
  await expect(selectors.savedStatus(page)).toBeVisible()
  await expect(observationDateTime(page)).toHaveText(OPENING_TIME_NORTH_UP)

  await setNorthBearingAndWaitForTheSave(page, NORTH_BEARING_DEGREES)

  await page.reload()

  await expect(selectors.planCanvas(page)).toBeVisible()
  await expect(selectors.roomProxies(page)).toHaveCount(1)
  await expect(observationDateTime(page)).toHaveText(OPENING_TIME_WEST_FRONT)
})
