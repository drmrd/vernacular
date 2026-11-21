import { test, expect, type Page } from '@playwright/test'
import {
  drawTwoWallsAndWaitForSave,
  drawWallAndWaitForSave,
  expectWallCount,
  gotoEditor,
  selectors,
} from './journeys/support'

// The "..." menu of a card on the Projects page renames and deletes the stored project that
// the card stands for. This spec runs the two actions on real storage, with a reload after
// each, so that what the page shows is what was stored. The first project has one wall and is
// renamed from its card; the second has two walls and keeps the default name, so the two cards
// are told apart by name and the projects by what each holds.

const FIRST_NAME = 'Hubbard House'
const SECOND_NAME = 'Untitled project'

async function showProjectsPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = '#/projects'
  })
  await expect(selectors.projectsPage(page)).toBeVisible()
}

async function renameFromCard(page: Page, from: string, to: string): Promise<void> {
  await selectors.cardActionsButton(page, from).click()
  await selectors.cardMenuItem(page, 'Rename').click()
  const form = selectors.projectCard(page, from).getByRole('textbox', { name: 'Project name' })
  await form.fill(to)
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(selectors.projectCard(page, to)).toBeVisible()
}

async function deleteFromCard(page: Page, name: string): Promise<void> {
  await selectors.cardActionsButton(page, name).click()
  await selectors.cardMenuItem(page, 'Delete').click()
  const dialog = page.getByRole('alertdialog', { name: `Delete "${name}"?` })
  await dialog.getByRole('button', { name: 'Delete project' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(selectors.projectCard(page, name)).toHaveCount(0)
}

// One project with a wall, renamed from its card, and a second project with two walls, which
// is the one open. The Projects page shows both cards.
async function storeTwoProjects(page: Page): Promise<void> {
  await gotoEditor(page)
  await drawWallAndWaitForSave(page)
  await showProjectsPage(page)
  await renameFromCard(page, SECOND_NAME, FIRST_NAME)

  await selectors.projectsPage(page).getByRole('button', { name: 'New project' }).click()
  await expect(selectors.planCanvas(page)).toBeVisible()
  await drawTwoWallsAndWaitForSave(page)
  await showProjectsPage(page)
  await expect(selectors.projectCard(page, FIRST_NAME)).toBeVisible()
  await expect(selectors.projectCard(page, SECOND_NAME)).toBeVisible()
}

test.describe('The card of a project on the Projects page', () => {
  test('shows the name from a rename after a reload', async ({ page }) => {
    await gotoEditor(page)
    await drawWallAndWaitForSave(page)
    await showProjectsPage(page)

    await renameFromCard(page, SECOND_NAME, FIRST_NAME)
    await page.reload()

    await expect(selectors.projectCard(page, FIRST_NAME)).toBeVisible()
    await expect(selectors.projectCard(page, SECOND_NAME)).toHaveCount(0)
  })

  test('removes the card on a delete, and the other project opens with its walls after a reload', async ({
    page,
  }) => {
    await storeTwoProjects(page)

    await deleteFromCard(page, FIRST_NAME)
    await page.reload()

    await expect(selectors.projectCard(page, FIRST_NAME)).toHaveCount(0)
    await selectors.projectsPage(page).getByRole('link', { name: SECOND_NAME, exact: true }).click()
    await expect(selectors.planCanvas(page)).toBeVisible()
    await expectWallCount(page, 2)
  })

  test('leaves the page on a delete of the open project, and a reload never brings it back', async ({
    page,
  }) => {
    await storeTwoProjects(page)

    await deleteFromCard(page, SECOND_NAME)
    await expect(selectors.projectsPage(page)).toBeVisible()
    await expect(selectors.planCanvas(page)).toHaveCount(0)
    await page.reload()

    await expect(selectors.projectsPage(page).or(selectors.planCanvas(page))).toBeVisible()
    if (await selectors.planCanvas(page).isVisible()) {
      await expectWallCount(page, 1)
    } else {
      await expect(selectors.projectCard(page, SECOND_NAME)).toHaveCount(0)
      await expect(selectors.projectCard(page, FIRST_NAME)).toBeVisible()
    }
  })
})
