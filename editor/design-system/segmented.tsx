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
}

export function Segmented({ options, value, onSelect }: SegmentedProps) {
  return (
    <div className="ds-segmented" role="group">
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
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
