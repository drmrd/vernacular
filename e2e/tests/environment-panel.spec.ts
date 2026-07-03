import { test, expect, type Page } from '@playwright/test'

// A DOM-level journey through the Environment rail section: it drives the panel from the
// assembled editor with no 3D pane, since the tool rail renders in plan view. The visual
// truth of the lit scene is pinned separately by the CI scene-webgl baselines
// (scene-solar.spec.ts); this journey pins the panel-to-session wiring end to end.

// The exact fallback copy the panel shows in realistic mode before the site has a location
// (kept in lockstep with editor/environment/environment-panel.test.tsx).
const MISSING_LOCATION_NOTICE =
  'Realistic lighting needs the site location. Set latitude and longitude in the Site panel; ' +
  'until then the view falls back to schematic lighting.'

// Boot the assembled editor at its root and wait for the plan canvas, mirroring the other
// top-level DOM specs (smoke.spec.ts, keyboard-authoring.spec.ts, status-bar-visible.spec.ts).
async function gotoEditor(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByLabel('Floor plan')).toBeVisible()
}

test.describe('Journey: drive the environment panel', () => {
  test('toggles lighting mode, resolves the site location, scrubs weather, and manages scenes', async ({
    page,
  }) => {
    await gotoEditor(page)

    const environment = page.getByRole('region', { name: /environment/i })
    const site = page.getByRole('region', { name: /site/i })

    // 1. A fresh project boots in schematic lighting.
    await expect(environment.getByRole('button', { name: 'Schematic' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // 2. Switching to realistic lighting before the site has a location surfaces the fallback.
    await environment.getByRole('button', { name: 'Realistic' }).click()
    await expect(environment.getByRole('button', { name: 'Realistic' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByText(MISSING_LOCATION_NOTICE)).toBeVisible()

    // 3. Committing latitude and longitude in the Site panel clears the missing-location
    //    notice and the panel's readout reflects the coordinates.
    const latitude = site.getByLabel(/latitude/i)
    const longitude = site.getByLabel(/longitude/i)
    await latitude.fill('47.6')
    await latitude.press('Enter')
    await longitude.fill('-122.33')
    await longitude.press('Enter')

    await expect(page.getByText(MISSING_LOCATION_NOTICE)).toHaveCount(0)
    await expect(environment.getByText(/latitude 47\.6/i)).toBeVisible()
    await expect(environment.getByText(/longitude -122\.33/i)).toBeVisible()

    // A site with coordinates but no timezone legitimately raises a separate
    // missing-timezone notice; committing a timezone clears it so the panel reads cleanly.
    // This journey only pins the missing-location notice, not the timezone one.
    const timezone = site.getByLabel(/timezone/i)
    await timezone.fill('America/Los_Angeles')
    await timezone.press('Enter')

    // 4. Scrubbing the cloud-cover dial moves the percentage readout with it.
    await expect(environment.getByText('0%')).toBeVisible()
    const cloudCover = environment.getByRole('slider', { name: /cloud cover/i })
    await cloudCover.fill('0.6')
    await expect(cloudCover).toHaveValue('0.6')
    await expect(environment.getByText('60%')).toBeVisible()

    // 5. Saving the current conditions under a name lists the scene.
    await environment.getByLabel(/scene name/i).fill('Winter dusk')
    await environment.getByRole('button', { name: /save scene/i }).click()
    await expect(environment.getByText(/no saved scenes/i)).toHaveCount(0)
    await expect(environment.getByRole('button', { name: /Apply Winter dusk/i })).toBeVisible()

    // 6. Removing it empties the saved-scenes list again.
    await environment.getByRole('button', { name: /Remove Winter dusk/i }).click()
    await expect(environment.getByRole('button', { name: /Remove Winter dusk/i })).toHaveCount(0)
    await expect(environment.getByText(/no saved scenes/i)).toBeVisible()
  })
})
