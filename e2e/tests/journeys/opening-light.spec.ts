import { test, expect, type Page } from '@playwright/test'
import {
  drawClosedRoom,
  editAndWaitForTheSave,
  gotoEditor,
  observationDateTime,
  SAVING_STATUS_TEXT,
  selectors,
} from './support'

// A project can remember the light it opens in. The owner sets the time in the Environment panel,
// clicks "Use this light when the project opens", and every later open starts in that light. Moving
// the time without that click stores nothing. The journey draws one closed room, which has no site
// and so opens at 10:30, stores 08:00, reloads, and reads the stored time off the panel.

const OPENING_TIME_NO_SITE = '2026-03-20 10:30'
const STORED_DATE_TIME_INPUT = '2026-03-20T08:00'
const STORED_DATE_TIME_OUTPUT = '2026-03-20 08:00'
const MOVED_DATE_TIME_INPUT = '2026-03-20T16:00'
const MOVED_DATE_TIME_OUTPUT = '2026-03-20 16:00'
const STORED_LIGHT_STATUS = 'Opens at 20 March 2026, 08:00, clear sky.'
const STORE_BUTTON_NAME = 'Use this light when the project opens'
// Autosave waits 500 ms after an edit before it starts to write; the quiet period spans it twice.
const AUTOSAVE_QUIET_PERIOD_MS = 1000

const environmentRegion = (page: Page) => page.getByRole('region', { name: /environment/i })
const observationInput = (page: Page) => page.getByLabel('Observation date and time')
const openingLightStatus = (page: Page) =>
  page.getByRole('status').filter({ hasText: /^Opens (at|in) / })

// Draws the room, lets the drawing save, and turns on realistic lighting, which enables the time
// controls (schematic lighting, the default, disables them).
async function openRealisticProject(page: Page): Promise<void> {
  await gotoEditor(page)
  await drawClosedRoom(page)
  await expect(selectors.savedStatus(page)).toBeVisible()
  await expect(observationDateTime(page)).toHaveText(OPENING_TIME_NO_SITE)
  await environmentRegion(page)
    .getByRole('group', { name: 'Lighting mode' })
    .getByRole('button', { name: 'Realistic' })
    .click()
}

// Clicks the store button and waits until the click is stored.
async function storeTheLight(page: Page): Promise<void> {
  await editAndWaitForTheSave(page, () =>
    page.getByRole('button', { name: STORE_BUTTON_NAME }).click(),
  )
}

async function reloadIntoTheEditor(page: Page): Promise<void> {
  await page.reload()
  await expect(selectors.planCanvas(page)).toBeVisible()
  await expect(selectors.roomProxies(page)).toHaveCount(1)
}

test('stores the light the project opens in and reopens in it', async ({ page }) => {
  await openRealisticProject(page)

  await observationInput(page).fill(STORED_DATE_TIME_INPUT)
  await expect(observationDateTime(page)).toHaveText(STORED_DATE_TIME_OUTPUT)

  await storeTheLight(page)
  await expect(openingLightStatus(page)).toHaveText(STORED_LIGHT_STATUS)

  await reloadIntoTheEditor(page)

  await expect(observationDateTime(page)).toHaveText(STORED_DATE_TIME_OUTPUT)
  await expect(openingLightStatus(page)).toHaveText(STORED_LIGHT_STATUS)
})

test('keeps the stored light when the time moves without a click', async ({ page }) => {
  await openRealisticProject(page)
  await observationInput(page).fill(STORED_DATE_TIME_INPUT)
  await storeTheLight(page)

  await observationInput(page).fill(MOVED_DATE_TIME_INPUT)
  await expect(observationDateTime(page)).toHaveText(MOVED_DATE_TIME_OUTPUT)
  // The fixed wait and the count check only prove the move saved nothing together with the reload
  // below: a wrong save still running fails the count check, and one that has finished shows 16:00
  // after the reload. Keep both halves.
  await page.waitForTimeout(AUTOSAVE_QUIET_PERIOD_MS)
  await expect(page.getByText(SAVING_STATUS_TEXT)).toHaveCount(0)
  await expect(selectors.savedStatus(page)).toBeVisible()

  await reloadIntoTheEditor(page)

  await expect(observationDateTime(page)).toHaveText(STORED_DATE_TIME_OUTPUT)
})
