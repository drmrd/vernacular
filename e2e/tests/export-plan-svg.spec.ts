import { test, expect } from '@playwright/test'

// The Export plan button triggers a synthetic-anchor download of an `.svg`
// file named by the project name. The app boots with the default project
// "Untitled project", so the suggested filename is `untitled-project.svg`.
const EXPECTED_FILENAME = 'untitled-project.svg'

test.describe('Export plan download', () => {
  test('downloads the default project plan as a named .svg file', async ({ page, browserName }) => {
    // The download is observable on headless Chromium and Firefox. Headless
    // WebKit never renders the editor shell (the Floor plan canvas stays absent),
    // so the Export plan button cannot be reached and the download cannot fire.
    test.skip(
      browserName === 'webkit',
      'Headless WebKit does not render the editor shell, so the button is unreachable',
    )

    await page.goto('/')

    await expect(page.getByLabel('Floor plan')).toBeVisible()

    const exportButton = page
      .getByRole('navigation', { name: 'Project' })
      .getByRole('button', { name: 'Export plan' })
    await expect(exportButton).toBeVisible()

    const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()])

    expect(download.suggestedFilename()).toBe(EXPECTED_FILENAME)
  })
})
