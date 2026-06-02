import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const platformSuffix = process.platform === 'darwin' ? 'darwin' : 'linux'
const baselinePath = path.join(
  process.cwd(),
  'e2e',
  'tests',
  'visual-regression.spec.ts-snapshots',
  `home-chromium-${platformSuffix}.png`,
)
const baselineExists = fs.existsSync(baselinePath)

test.describe('Home page visual baseline', () => {
  test.skip(
    !baselineExists,
    `No committed baseline for platform ${platformSuffix}; regenerate with 'pnpm e2e --update-snapshots=missing'.`,
  )

  test('matches the committed screenshot', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('home.png', { fullPage: true })
  })
})
