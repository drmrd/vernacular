import { test, expect } from '@playwright/test'

// Crash recovery is wired into the production app through the write-ahead autosave
// model: each autosave writes a recovery snapshot, saves the canonical store, then
// prunes the snapshot. A clean reload therefore restores silently from the canonical
// store with no recovery prompt; only a snapshot left behind by an interrupted cycle
// (a crash) triggers the prompt on the next boot.

test.describe('Crash recovery', () => {
  test('restores work silently on a clean reload without offering recovery', async ({ page }) => {
    await page.goto('/')

    const canvas = page.getByLabel('Floor plan')
    await expect(canvas).toBeVisible()

    await page.getByRole('button', { name: 'Wall', exact: true }).click()
    await canvas.click({ position: { x: 120, y: 200 } })
    await canvas.click({ position: { x: 520, y: 200 } })
    // Finish the run with Enter so the buffered wall commits.
    await page.keyboard.press('Enter')

    // The write-ahead cycle reports "saved" only after writeSnapshot, the canonical
    // save, and the prune all complete, so this waits out the prune.
    await expect(page.getByText('All changes saved')).toBeVisible()
    await expect(page.getByRole('option', { name: /^Wall,/ })).toHaveCount(1)

    await page.reload()

    await expect(page.getByLabel('Floor plan')).toBeVisible()
    // The wall comes back from the canonical store, restored silently.
    await expect(page.getByRole('option', { name: /^Wall,/ })).toHaveCount(1)
    // The snapshot was pruned on the successful save, so no recovery prompt appears.
    await expect(page.getByText(/Unsaved changes were recovered/i)).toHaveCount(0)
  })

  test('offers recovery after a crash leaves an unsaved snapshot', async ({
    page,
    browserName,
  }) => {
    // WebKit does not support createWritable on OPFS handles from the main thread,
    // so it cannot write the planted snapshot (same limitation as durable-storage).
    test.skip(browserName === 'webkit', 'WebKit lacks main-thread OPFS createWritable')

    // Plant a recovery snapshot at the production project's OPFS location through the
    // storage hook, simulating a crash that wrote a snapshot but never saved + pruned.
    await page.goto('/?e2e-storage')
    await page.waitForFunction(() => window.vernacularE2eStorage !== undefined)
    const planted = await page.evaluate(() => window.vernacularE2eStorage!.plantRecoverySnapshot())
    expect(planted).toBe(true)

    // Boot the production app: it resolves the same snapshot store and finds the
    // planted snapshot, so it offers to recover the unsaved work.
    await page.goto('/')
    await expect(page.getByLabel('Floor plan')).toBeVisible()
    await expect(page.getByText(/Unsaved changes were recovered/i)).toBeVisible()
  })
})
