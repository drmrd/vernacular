import { test, expect } from '@playwright/test'

// The Export bundle button triggers a synthetic-anchor download of a
// `.building` archive named by `bundleFilename(project.meta.name)`. The app
// boots with the default project "Untitled project", so the suggested filename
// is `untitled-project.building`.
const EXPECTED_FILENAME = 'untitled-project.building'

test.describe('Export bundle download', () => {
  test('downloads the default project as a named .building bundle', async ({
    page,
    browserName,
  }) => {
    // The download is observable on headless Chromium and Firefox. Headless
    // WebKit never renders the editor shell (the Floor plan canvas stays absent),
    // so the Export bundle button cannot be reached and the download cannot fire.
    test.skip(
      browserName === 'webkit',
      'Headless WebKit does not render the editor shell, so the button is unreachable',
    )

    await page.goto('/')

    await expect(page.getByLabel('Floor plan')).toBeVisible()

    await page.getByRole('button', { name: /^export$/i }).click()
    const exportItem = page.getByRole('menuitem', { name: 'Project bundle' })
    await expect(exportItem).toBeVisible()

    const [download] = await Promise.all([page.waitForEvent('download'), exportItem.click()])

    expect(download.suggestedFilename()).toBe(EXPECTED_FILENAME)
  })
})
