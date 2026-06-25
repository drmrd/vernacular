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
  /**
   * An option to render in a transient previewed state, distinct from the selected
   * one: it gets the `is-preview` class without the pressed flag or active class, so
   * an external highlight (such as the plan hovering a wall face) can echo onto the
   * matching chip without changing the selection.
   */
  previewValue?: string
  /** Invoked with the clicked option's `value`. */
  onSelect: (value: string) => void
  /** Optional accessible name for the option group (rendered as aria-label). */
  label?: string
  /**
   * Optional accessible name supplied through the group's `title` instead of
   * `aria-label`. It names the group for assistive tech and `getByRole` queries
   * without being picked up by label-text queries, so a picker can sit beside an
   * input that shares a word in its label without colliding.
   *
   * Caveat: `title` also renders a native browser tooltip on the group container,
   * so use it only when that tooltip is acceptable; prefer `label`/`aria-label`
   * otherwise.
   */
  title?: string
  /** Fires with an option's `value` when the pointer enters it, and with null when the pointer leaves the group. */
  onHover?: (value: string | null) => void
}

export function Segmented({
  options,
  value,
  previewValue,
  onSelect,
  label,
  title,
  onHover,
}: SegmentedProps) {
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
        const isPreview = option.value === previewValue
        const classes = ['ds-segmented__option', isActive && 'is-active', isPreview && 'is-preview']
          .filter(Boolean)
          .join(' ')
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
