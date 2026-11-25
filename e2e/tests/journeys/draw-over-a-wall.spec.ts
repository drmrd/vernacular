import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { unzipSync } from 'fflate'
import type { Project, Wall } from '../../../core/model/types'
import { CLOSED_ROOM, drawClosedRoom, expectWallCount, gotoEditor, selectors } from './support'

async function wallsFromProjectBundle(page: Page): Promise<readonly Wall[]> {
  await page.getByRole('button', { name: /^export$/i }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Project bundle' }).click(),
  ])
  const document = unzipSync(await readFile(await download.path()))['vernacular.json']
  if (document === undefined) throw new Error('the project bundle has no vernacular.json')
  const project = JSON.parse(new TextDecoder().decode(document)) as Project
  const floor = project.floors[0]
  if (floor === undefined) throw new Error('the exported project has no floor')
  return floor.walls
}

test('draws over a wall and adds only the uncovered part while keeping the room', async ({
  page,
}) => {
  await gotoEditor(page)
  await drawClosedRoom(page)
  await expectWallCount(page, 4)
  const original = await wallsFromProjectBundle(page)
  const [originalTop] = original
  if (originalTop === undefined) throw new Error('the room has no top wall')

  const canvas = selectors.planCanvas(page)
  const { left, right, top } = CLOSED_ROOM
  await canvas.click({ position: { x: (left + right) / 2, y: top } })
  await canvas.click({ position: { x: left - 100, y: top } })
  await expect
    .soft(
      page
        .getByText('Part of this wall was already there.', { exact: true })
        .filter({ visible: true })
        .first(),
    )
    .toBeVisible()
  await page.keyboard.press('Enter')

  await expectWallCount(page, 5)
  await expect(selectors.roomProxies(page)).toHaveCount(1)
  const extended = await wallsFromProjectBundle(page)
  expect(extended.slice(0, original.length)).toEqual(original)
  const added = extended[original.length]
  if (added === undefined) throw new Error('the project has no wall for the extension')
  expect
    .soft(added.start.x, 'the stored extension starts at the original wall endpoint')
    .toBeCloseTo(originalTop.start.x, 6)
  expect(added.start.y).toBeCloseTo(originalTop.start.y, 6)
  expect(added.end.y).toBeCloseTo(originalTop.start.y, 6)
  expect(added.end.x).toBeLessThan(originalTop.start.x)

  await selectors.undoButton(page).click()
  await expectWallCount(page, 4)
  expect(await wallsFromProjectBundle(page)).toEqual(original)
  await selectors.redoButton(page).click()
  await expectWallCount(page, 5)
  expect(await wallsFromProjectBundle(page)).toEqual(extended)

  await canvas.click({ position: { x: left, y: top } })
  await canvas.click({ position: { x: right, y: top } })
  await expect
    .soft(
      page
        .getByText('This wall was already there.', { exact: true })
        .filter({ visible: true })
        .first(),
    )
    .toBeVisible()
  await page.keyboard.press('Enter')
  await expect.soft(selectors.wallProxies(page)).toHaveCount(5)
  await expect(selectors.roomProxies(page)).toHaveCount(1)
  expect(await wallsFromProjectBundle(page)).toEqual(extended)
})
