import { test, expect } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { readStoryIds } from '../../scripts/story-index.mjs'

// Visual-regression baselines for every testable Storybook story. The ids come
// from the built `storybook-static/index.json` (run `pnpm build-storybook`
// first), so the suite grows automatically as stories are backfilled. Stories
// that opt out of automated testing (Storybook's `!test` tag, e.g. the full-app
// shell that mounts the live WebGL scene) are absent from this set by way of
// `readStoryIds`. Baselines are linux-only and committed; regenerate them in
// docker with `pnpm stories:update-snapshots`.

const STORYBOOK_INDEX = path.join(process.cwd(), 'storybook-static', 'index.json')

function builtStoryIds(): string[] {
  if (!existsSync(STORYBOOK_INDEX)) {
    return []
  }
  return readStoryIds(readFileSync(STORYBOOK_INDEX, 'utf8'))
}

const storyIds = builtStoryIds()

test.describe('Storybook story visual baselines', () => {
  // A missing or empty built index means `build-storybook` did not run or
  // produced no testable stories. Fail loudly here rather than silently
  // registering zero baselines and reporting a vacuous pass.
  test('the built Storybook lists at least one testable story', () => {
    expect(
      storyIds.length,
      'No testable stories in storybook-static/index.json; run `pnpm build-storybook` first.',
    ).toBeGreaterThan(0)
  })

  for (const id of storyIds) {
    test(`renders ${id} to its committed baseline`, async ({ page }) => {
      await page.goto(`iframe.html?id=${id}&viewMode=story&args=`)

      const root = page.locator('#storybook-root')
      await expect(root).toBeVisible()

      // Wait for webfonts so glyph metrics are settled before the screenshot.
      await page.evaluate(async () => {
        await document.fonts.ready
      })

      await expect(root).toHaveScreenshot(`${id}.png`)
    })
  }
})
