import { test, expect } from '@playwright/test'

// The editor is a fixed-viewport shell: however tall the rail or inspector content
// grows, the status bar stays pinned and visible rather than being pushed off the
// bottom of the page. A short viewport forces the rail content to exceed the height,
// which on a non-fixed shell overflows the page and hides the status bar.
test('keeps the status bar floor tabs in view at a short viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 380 })
  await page.goto('/')
  await expect(page.getByLabel('Floor plan')).toBeVisible()
  const floors = page.getByRole('navigation', { name: /floors/i })
  await expect(floors).toBeInViewport()
})
