import { test, expect } from '@playwright/test'

// The Export PDF button triggers a synthetic-anchor download of a `.pdf`
// file named by the project name. The app boots with the default project
// "Untitled project", so the suggested filename is `untitled-project.pdf`.
const EXPECTED_FILENAME = 'untitled-project.pdf'

test.describe('Export PDF download', () => {
  test('downloads the default project plan as a named .pdf file', async ({ page, browserName }) => {
    // The download is observable on headless Chromium and Firefox. Headless
    // WebKit never renders the editor shell (the Floor plan canvas stays absent),
    // so the Export PDF button cannot be reached and the download cannot fire.
    test.skip(
      browserName === 'webkit',
      'Headless WebKit does not render the editor shell, so the button is unreachable',
    )

    await page.goto('/')

    await expect(page.getByLabel('Floor plan')).toBeVisible()

    const exportButton = page
      .getByRole('navigation', { name: 'Project' })
      .getByRole('button', { name: 'Export PDF' })
    await expect(exportButton).toBeVisible()

    const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()])

    expect(download.suggestedFilename()).toBe(EXPECTED_FILENAME)
  })
})
