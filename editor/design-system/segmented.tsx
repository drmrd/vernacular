import './segmented.css'

export interface SegmentedOption {
  /** The value reported to onSelect and compared against `value`. */
  value: string
  /** The visible, accessible button label. */
  label: string
}

export interface SegmentedProps {
  /** The set of mutually exclusive options, rendered in order as buttons. */
  options: SegmentedOption[]
  /** The currently selected option value. */
  value: string
  /** Invoked with the clicked option's `value`. */
  onSelect: (value: string) => void
  /** Optional accessible name for the option group (rendered as aria-label). */
  label?: string
  /**
   * Optional accessible name supplied through the group's `title` instead of
   * `aria-label`. It names the group for assistive tech and `getByRole` queries
   * without being picked up by label-text queries, so a picker can sit beside an
   * input that shares a word in its label without colliding.
   */
  title?: string
  /** Fires with an option's `value` when the pointer enters it, and with null when the pointer leaves the group. */
  onHover?: (value: string | null) => void
}

export function Segmented({ options, value, onSelect, label, title, onHover }: SegmentedProps) {
  return (
    <div
      className="ds-segmented"
      role="group"
      aria-label={label}
      title={title}
      onMouseLeave={() => onHover?.(null)}
    >
      {options.map((option) => {
        const isActive = option.value === value
        const classes = ['ds-segmented__option', isActive && 'is-active'].filter(Boolean).join(' ')
        return (
          <button
            key={option.value}
            type="button"
            className={classes}
            aria-pressed={isActive}
            onClick={() => onSelect(option.value)}
            onMouseEnter={() => onHover?.(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
