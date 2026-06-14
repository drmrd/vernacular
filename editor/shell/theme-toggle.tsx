import { useTheme, type ThemeChoice } from '../design-system'
import './theme-toggle.css'

const CHOICES: { value: ThemeChoice; label: string }[] = [
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
    <fieldset className="theme-toggle">
      <legend className="theme-toggle__legend">Theme</legend>
      {CHOICES.map((option) => (
        <label key={option.value} className="theme-toggle__option">
          <input
            type="radio"
            name="theme"
            value={option.value}
            checked={choice === option.value}
            onChange={() => setChoice(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  )
}
