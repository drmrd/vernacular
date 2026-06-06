import { test, expect } from '@playwright/test'

// Validates the durable browser-storage adapters (OPFS-backed project store via
// FileSystemDirectory, the IndexedDB recent list, and the Web Locks manager) in a
// real browser, which jsdom cannot exercise. The adapters are reached through the
// query-parameter-guarded hook installed by src/e2e-storage-hook.ts.

async function waitForHook(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?e2e-storage')
  await page.waitForFunction(() => window.vernacularE2eStorage !== undefined)
}

test.describe('Durable storage adapters', () => {
  test('round-trips a project through the OPFS-backed store', async ({ page, browserName }) => {
    // WebKit does not support createWritable on OPFS handles from the main thread
    // (it requires a worker-side sync access handle). Tracked as follow-up work.
    test.skip(browserName === 'webkit', 'WebKit lacks main-thread OPFS createWritable')
    await waitForHook(page)
    const result = await page.evaluate(() => window.vernacularE2eStorage!.opfsRoundTrip())
    expect(result.loadedName).toBe('Round Trip House')
    expect(result.floorCount).toBe(1)
    expect(result.listedId).toBe(true)
    expect(result.deletedGone).toBe(true)
  })

  test('persists an OPFS project across a page reload', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit lacks main-thread OPFS createWritable')
    await waitForHook(page)
    await page.evaluate(() => window.vernacularE2eStorage!.opfsPersistSave())
    await waitForHook(page)
    const name = await page.evaluate(() => window.vernacularE2eStorage!.opfsPersistName())
    expect(name).toBe('Persisted House')
  })

  test('records and removes a recent project in IndexedDB', async ({ page }) => {
    await waitForHook(page)
    const result = await page.evaluate(() => window.vernacularE2eStorage!.recentRoundTrip())
    expect(result.recordedName).toBe('Recent House')
    expect(result.recordedBackend).toBe('opfs')
    expect(result.removedGone).toBe(true)
  })

  test('grants the first Web Lock holder and reports contention', async ({ page }) => {
    await waitForHook(page)
    const result = await page.evaluate(() => window.vernacularE2eStorage!.lockSequence())
    expect(result.first).toBe(true)
    expect(result.second).toBe(false)
    expect(result.reacquired).toBe(true)
  })
})
