// The brass crosshair brand mark: a draughtsman's reticle (outer ring, center dot,
// and four radial ticks) shown beside the Vernacular wordmark in the header. Color
// comes from the accent token via currentColor on the wrapping class.
export function BrandMark() {
  return (
    <svg
      className="editor-shell__brand-mark"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      role="img"
      aria-label="Vernacular"
    >
      <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
      <circle cx="10" cy="10" r="2.5" fill="currentColor" />
      <line x1="10" y1="2" x2="10" y2="5" stroke="currentColor" strokeWidth={1.5} />
      <line x1="10" y1="18" x2="10" y2="15" stroke="currentColor" strokeWidth={1.5} />
      <line x1="2" y1="10" x2="5" y2="10" stroke="currentColor" strokeWidth={1.5} />
      <line x1="18" y1="10" x2="15" y2="10" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  )
}
