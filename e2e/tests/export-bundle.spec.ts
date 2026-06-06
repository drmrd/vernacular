import { test, expect } from '@playwright/test'

// The Export bundle button triggers a synthetic-anchor download of a
// `.house.zip` archive named by `bundleFilename(project.meta.name)`. The app
// boots with the default project "Untitled project", so the suggested filename
// is `untitled-project.house.zip`.
const EXPECTED_FILENAME = 'untitled-project.house.zip'

test.describe('Export bundle download', () => {
  test('downloads the default project as a named .house.zip bundle', async ({
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

    const exportButton = page
      .getByRole('navigation', { name: 'Project' })
      .getByRole('button', { name: 'Export bundle' })
    await expect(exportButton).toBeVisible()

    const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()])

    expect(download.suggestedFilename()).toBe(EXPECTED_FILENAME)
  })
})
