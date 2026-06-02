import { test, expect } from '@playwright/test'

test.describe('App shell smoke', () => {
  test('loads the home page and renders the application root', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#root')).toBeVisible()
  })
})
