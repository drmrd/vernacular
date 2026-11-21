interface ReasonDescriptionProps {
  id: string
  reason: string | undefined
}

/**
 * The hidden description an unavailable control points at with `aria-describedby`. It
 * renders nothing when there is no reason, so an empty reason gives no description.
 */
export function ReasonDescription({ id, reason }: ReasonDescriptionProps) {
  return reason ? (
    <span hidden id={id}>
      {reason}
    </span>
  ) : null
}
