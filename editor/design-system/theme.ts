export type ThemeChoice = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system']

/** Narrows an arbitrary value to a `ThemeChoice`, the shared vocabulary for theme selection. */
export function isThemeChoice(value: unknown): value is ThemeChoice {
  return (THEME_CHOICES as readonly unknown[]).includes(value)
}

/** Resolves an arbitrary value to a `ThemeChoice`, falling back to `'system'` when unrecognized. */
export function resolveThemeChoice(value: unknown): ThemeChoice {
  return isThemeChoice(value) ? value : 'system'
}

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ResolvedTheme {
  if (choice === 'system') {
    return prefersDark ? 'dark' : 'light'
  }
  return choice
}
