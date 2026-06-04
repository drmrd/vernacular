import { test, expect } from '@playwright/test'

test.describe('Storage accessibility', () => {
  test('OPFS and IndexedDB are reachable in this browser', async ({ page }) => {
    await page.goto('/')

    const reachable = await page.evaluate(() => ({
      opfs: typeof navigator.storage?.getDirectory === 'function',
      indexedDb: typeof indexedDB !== 'undefined',
    }))

    expect(reachable.opfs).toBe(true)
    expect(reachable.indexedDb).toBe(true)
  })
})
