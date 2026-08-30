import { Segmented, useTheme, isThemeChoice, type ThemeChoice } from '../design-system'

const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

// A compact segmented control for the theme choice. The default stays "system" so
// the editor respects an OS dark preference; this control makes the parchment light
// theme one click away rather than hidden.
export function ThemeToggle() {
  const { choice, setChoice } = useTheme()
  return (
    <Segmented
      label="Theme"
      options={THEME_OPTIONS}
      value={choice}
      onSelect={(value) => {
        if (isThemeChoice(value)) setChoice(value)
      }}
    />
  )
}
