import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('Home page accessibility', () => {
  test('has no axe-core violations on initial render', async ({ page }) => {
    await page.goto('/')
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })
})
