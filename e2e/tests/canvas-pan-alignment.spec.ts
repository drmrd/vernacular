import { test, expect } from '@playwright/test'

test.describe('Canvas pan alignment', () => {
  test('pan tracks the cursor 1:1 so a drawn wall stays under a click shifted by the pan distance', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.goto('/')

    const canvas = page.getByLabel('Floor plan')
    await expect(canvas).toBeVisible()

    const box = await canvas.boundingBox()
    if (box === null) {
      throw new Error('Floor plan canvas has no bounding box')
    }

    // Draw a vertical wall by two clicks sharing the same displayed x.
    const x0 = box.width * 0.3
    await canvas.click({ position: { x: x0, y: box.height * 0.3 } })
    await canvas.click({ position: { x: x0, y: box.height * 0.6 } })
    // Finish the run with Enter so the buffered wall commits.
    await page.keyboard.press('Enter')

    // Sanity: the wall was actually drawn.
    await expect(page.getByText('Walls: 1')).toBeVisible()

    // Middle-mouse-button drag pan to the right by PAN CSS pixels.
    const PAN = box.width * 0.25
    const sx = box.x + box.width * 0.5
    const sy = box.y + box.height * 0.5
    await page.mouse.move(sx, sy)
    await page.mouse.down({ button: 'middle' })
    await page.mouse.move(sx + PAN, sy, { steps: 10 })
    await page.mouse.up({ button: 'middle' })

    // Switch to the Select tool.
    await page.getByRole('button', { name: 'Select' }).click()

    // On a correct 1:1 pan, panning the content right by PAN moves the wall
    // right by exactly PAN CSS pixels, so the wall now sits at x0 + PAN.
    await canvas.click({ position: { x: x0 + PAN, y: box.height * 0.45 } })

    // The wall is selected only if the click landed on it, which proves the
    // pan tracked the cursor 1:1 rather than over-panning.
    await expect(page.getByRole('textbox', { name: /thickness/i })).toBeVisible()
  })
})
