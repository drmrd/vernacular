import { test, expect } from '@playwright/test'

test.describe('Service worker scaffold', () => {
  test('serves the worker script as JavaScript from the site root', async ({ page }) => {
    const response = await page.request.get('/service-worker.js')

    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('javascript')
  })

  test('registers, activates, and controls the page', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Worker activation is verified on Chromium')

    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload()

    const controlled = await page.evaluate(() => navigator.serviceWorker.controller !== null)
    expect(controlled).toBe(true)
  })
})
