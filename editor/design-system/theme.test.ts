import { describe, it, expect } from 'vitest'
import { THEME_SETTING, resolveTheme } from './theme'

describe('resolveTheme', () => {
  it('resolves an explicit light choice to light regardless of the OS', () => {
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('resolves an explicit dark choice to dark regardless of the OS', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('dark', true)).toBe('dark')
  })

  it('follows the OS when the choice is system', () => {
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('system', true)).toBe('dark')
  })
})

describe('the theme setting', () => {
  it('is named theme and defaults to the system choice', () => {
    expect(THEME_SETTING.name).toBe('theme')
    expect(THEME_SETTING.defaultValue).toBe('system')
  })

  it('takes each of the three choices', () => {
    const choices: unknown[] = ['light', 'dark', 'system']
    for (const choice of choices) {
      expect(THEME_SETTING.parse(choice)).toBe(choice)
    }
  })

  it('refuses any other value', () => {
    const refused: unknown[] = ['blue', 42, null, { theme: 'dark' }]
    for (const value of refused) {
      expect(THEME_SETTING.parse(value)).toBeUndefined()
    }
  })
})
