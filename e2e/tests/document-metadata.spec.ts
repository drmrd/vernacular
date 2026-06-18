import { test, expect } from '@playwright/test'

test.describe('Document metadata and app icons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('exposes a non-empty meta description', async ({ page }) => {
    const description = page.locator('meta[name="description"]')

    await expect(description).toHaveCount(1)
    const content = await description.getAttribute('content')
    expect(content?.trim().length ?? 0).toBeGreaterThan(0)
  })

  test('exposes light and dark theme-color metas matching the surface tokens', async ({ page }) => {
    const lightThemeColor = page.locator(
      'meta[name="theme-color"][media="(prefers-color-scheme: light)"]',
    )
    const darkThemeColor = page.locator(
      'meta[name="theme-color"][media="(prefers-color-scheme: dark)"]',
    )

    await expect(lightThemeColor).toHaveAttribute('content', '#f4efe4')
    await expect(darkThemeColor).toHaveAttribute('content', '#1a2738')
  })

  test('links a favicon, an apple-touch-icon, and a web manifest', async ({ page }) => {
    await expect(page.locator('link[rel~="icon"]').first()).toBeAttached()
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1)
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1)
  })

  test('serves every linked icon and the manifest with a 200 response', async ({ page }) => {
    const hrefs = await page.evaluate(() => {
      const selectors = [
        'link[rel~="icon"]',
        'link[rel="apple-touch-icon"]',
        'link[rel="manifest"]',
      ]
      const links = selectors.flatMap((selector) =>
        Array.from(document.querySelectorAll<HTMLLinkElement>(selector)),
      )
      return links.map((link) => link.getAttribute('href') ?? '')
    })

    expect(hrefs.length).toBeGreaterThan(0)

    for (const href of hrefs) {
      const response = await page.request.get(href)
      expect(response.status(), `expected 200 for ${href}`).toBe(200)
    }
  })

  test('declares the open graph and twitter card tags', async ({ page }) => {
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1)
    await expect(page.locator('meta[property="og:description"]')).toHaveCount(1)
    await expect(page.locator('meta[name="twitter:card"]')).toHaveCount(1)
  })
})
