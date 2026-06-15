// The brass north compass pinned to the plan's upper-right: an "N" above a needle
// whose filled half points north. The plan view never rotates, so north is always
// up; the mark is the draughtsman's orientation cue, brass like the brand reticle,
// its color flowing from the accent token through currentColor.
export function Compass() {
  return (
    <svg
      className="plan-overlay__compass"
      width="22"
      height="33"
      viewBox="0 0 24 36"
      role="img"
      aria-label="North"
    >
      <text className="plan-overlay__compass-label" x="12" y="9" textAnchor="middle">
        N
      </text>
      <polygon points="12,11 9,23 15,23" fill="currentColor" />
      <polygon points="12,33 9,23 15,23" fill="none" stroke="currentColor" strokeWidth={1} />
    </svg>
  )
}
