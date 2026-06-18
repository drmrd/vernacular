import { Segmented, useTheme, type ThemeChoice } from '../design-system'
import './theme-toggle.css'

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

const THEME_OPTIONS = CHOICES.map((choice) => ({ value: choice.value, label: choice.label }))
const THEME_CHOICES = CHOICES.map((choice) => choice.value)

function isThemeChoice(value: string): value is ThemeChoice {
  return (THEME_CHOICES as readonly string[]).includes(value)
}

// A compact segmented control for the theme choice. The default stays "system" so
// the editor respects an OS dark preference; this control makes the parchment light
// theme one click away rather than hidden.
export function ThemeToggle() {
  const { choice, setChoice } = useTheme()
  return (
    <div className="theme-toggle">
      <span className="theme-toggle__label">Theme</span>
      <Segmented
        label="Theme"
        options={THEME_OPTIONS}
        value={choice}
        onSelect={(value) => {
          if (isThemeChoice(value)) setChoice(value)
        }}
      />
    </div>
  )
}
