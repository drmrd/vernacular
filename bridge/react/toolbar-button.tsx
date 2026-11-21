import { useId } from 'react'

interface ToolbarButtonProps {
  label: string
  onActivate: () => void
  unavailableReason?: string
  pressed?: boolean
  title?: string
  className?: string
}

/**
 * A toolbar action that stays focusable when it cannot act. An unavailable button keeps no
 * native `disabled`, so keyboard and screen-reader users can still reach it; `aria-disabled`
 * marks it inert, and the reason is both the hover text and a hidden description that
 * `aria-describedby` points at. The label stays the accessible name.
 */
export function ToolbarButton({
  label,
  onActivate,
  unavailableReason,
  pressed,
  title,
  className = 'scene-nav-toolbar__btn',
}: ToolbarButtonProps) {
  const reasonId = useId()
  const unavailable = Boolean(unavailableReason)

  const handleClick = () => {
    if (unavailable) return
    onActivate()
  }

  return (
    <>
      <button
        type="button"
        className={className}
        aria-pressed={pressed}
        aria-disabled={unavailable ? true : undefined}
        aria-describedby={unavailable ? reasonId : undefined}
        title={unavailable ? unavailableReason : title}
        onClick={handleClick}
      >
        {label}
      </button>
      {unavailable ? (
        <span hidden id={reasonId}>
          {unavailableReason}
        </span>
      ) : null}
    </>
  )
}
