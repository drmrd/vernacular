import { test, expect } from '@playwright/test'
import { gotoEditor } from './support'

// The Paint panel lists the active floor's paintable surfaces (each wall's two
// faces, plus the floor and ceiling). Choosing a surface binds the color picker
// to it; picking a palette color dispatches the assignment, and the surface row's
// swatch reflects the stored paint, proving the edit applied end to end.
test('edits a surface color and it applies', async ({ page }) => {
  await gotoEditor(page)

  // The wall-less starting floor always exposes a Floor surface to paint.
  const floorSurface = page.getByRole('button', { name: 'Floor', exact: true })
  await expect(floorSurface).toHaveAttribute('data-paint', 'none')

  // Selecting the surface reveals the bound color picker.
  await floorSurface.click()
  await expect(page.getByRole('searchbox', { name: /search colors/i })).toBeVisible()

  // Pick a bundled palette color; the swatch updates to the chosen color.
  await page.getByRole('button', { name: 'Sage Green' }).click()
  await expect(floorSurface).toHaveAttribute('data-paint', '#9aa583')
})
