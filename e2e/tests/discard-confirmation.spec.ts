import { test, expect } from '@playwright/test'

// The discard confirmation was rendered as an in-flow sibling of the editor frame,
// and that frame is a full-viewport grid that hides its overflow, so the prompt laid
// itself out a whole viewport below the fold. Nothing on screen changed when it
// opened: asking for a confirmation looked like a dead click, and the guarded action
// sat waiting on an answer nobody could see to give. Nothing in jsdom measures
// layout, so the check that the prompt is really on screen belongs here.
//
// The trigger is the recovery banner rather than a dirty project and New. Both open
// the same prompt through the same seam, but a dirty project is only dirty until the
// autosave debounce elapses, so driving it that way would race a 500ms timer, and
// timing-dependent end-to-end tests are a codified rejection in .claude/rules.md.
// The recovery banner's delete action always confirms, whatever the save state.

test.describe('Discard confirmation', () => {
  test('opens on screen and leaves the recovered work alone when cancelled', async ({
    page,
    browserName,
  }) => {
    // WebKit does not support createWritable on OPFS handles from the main thread,
    // so it cannot write the planted snapshot (same limitation as crash-recovery).
    test.skip(browserName === 'webkit', 'WebKit lacks main-thread OPFS createWritable')

    await page.goto('/?e2e-storage')
    await page.waitForFunction(() => window.vernacularE2eStorage !== undefined)
    const planted = await page.evaluate(() => window.vernacularE2eStorage!.plantRecoverySnapshot())
    expect(planted).toBe(true)

    await page.goto('/')
    const banner = page.getByRole('alert').filter({ hasText: /unsaved changes were recovered/i })
    await expect(banner).toBeVisible()

    await banner.getByRole('button', { name: 'Delete recovered copy' }).click()

    const prompt = page.getByRole('alertdialog')
    await expect(prompt).toBeVisible()

    // toBeVisible passes on a prompt parked a viewport below the fold, which is
    // exactly the state this pins against, so measure it instead.
    const box = await prompt.boundingBox()
    const viewport = page.viewportSize()
    if (box === null || viewport === null) {
      throw new Error('The discard prompt reported no layout box to measure.')
    }
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)

    // The prompt takes focus on the safe answer, so it is answerable without a mouse.
    const cancel = prompt.getByRole('button', { name: 'Cancel' })
    await expect(cancel).toBeFocused()
    await cancel.click()

    // Cancelling keeps what the prompt threatened: the recovered copy survives and
    // the banner is still there to be answered again.
    await expect(prompt).toBeHidden()
    await expect(banner).toBeVisible()
  })
})
