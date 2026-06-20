import { test, expect } from '@playwright/test'

// Drives the header dropdown menus (Project, Export) end to end from the keyboard
// and pointer in the real shell, proving the shared useMenuButton contract: a
// labeled, discoverable trigger, arrow-key roving between items, Escape closing
// and returning focus to the trigger, and opening one menu closing the other.
test.describe('Header menu keyboard handling', () => {
  test('the project menu trigger is a labeled, keyboard-operable button', async ({ page }) => {
    await page.goto('/')

    // Discoverability: the trigger reads as the word "Project", not a bare chevron.
    const trigger = page.getByRole('button', { name: 'Project', exact: true })
    await expect(trigger).toBeVisible()

    await trigger.click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()

    // Opening the menu lands focus on its first item.
    await expect(page.getByRole('menuitem').first()).toBeFocused()

    // Escape closes the menu and returns focus to the trigger.
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('the export menu roves focus with the arrow keys and closes on Escape', async ({ page }) => {
    await page.goto('/')

    const trigger = page.getByRole('button', { name: 'Export', exact: true })
    await trigger.click()
    await expect(page.getByRole('menu')).toBeVisible()

    // The export menu always wires four targets, so roving and a wrap are observable.
    const items = page.getByRole('menuitem')
    await expect(items.first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(items.nth(1)).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(items.first()).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('opening one header menu closes the other', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Project', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: /new project/i })).toBeVisible()

    // Pointing at the Export trigger dismisses the open project menu (its
    // outside-pointerdown closes it), then opens the export menu instead.
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await expect(page.getByRole('menu')).toHaveCount(1)
    await expect(page.getByRole('menuitem', { name: /bundle/i })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /new project/i })).toBeHidden()
  })
})
