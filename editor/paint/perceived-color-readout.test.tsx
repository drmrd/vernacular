import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { ReactElement } from 'react'
import { PerceivedColorContext } from '../../bridge/react/perceived-color-context'
import {
  createPerceivedColorStore,
  type PerceivedColorStore,
} from '../../bridge/perceived-color/perceived-color-store'
import {
  colorFromHex,
  describePerceivedShift,
  perceivedShiftLabel,
  type SurfaceRef,
} from '../../core'
import { PerceivedColorReadout } from './perceived-color-readout'

const LEFT_FACE: SurfaceRef = { kind: 'wall-face', wallId: 'w1', side: 'left' }
const RIGHT_FACE: SurfaceRef = { kind: 'wall-face', wallId: 'w1', side: 'right' }

afterEach(cleanup)

function renderReadout(
  surface: SurfaceRef,
  store: PerceivedColorStore | null,
  reference?: ReturnType<typeof colorFromHex>,
) {
  const ui: ReactElement = <PerceivedColorReadout surface={surface} reference={reference} />
  return store === null
    ? render(ui)
    : render(<PerceivedColorContext.Provider value={store}>{ui}</PerceivedColorContext.Provider>)
}

/** The color-swatch chip serializes an inline hex background as `rgb(r, g, b)` (jsdom's CSSOM
 *  normalizes color values on read-back), so tests compare against this converted form rather
 *  than the raw hex string. */
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${r}, ${g}, ${b})`
}

describe('PerceivedColorReadout', () => {
  it('renders nothing when there is no PerceivedColorContext provider at all', () => {
    // A finish section mounts this readout unconditionally, and neither isolated
    // Storybook stories nor existing finish-section component tests wrap
    // themselves in a PerceivedColorContext.Provider. If the readout rendered
    // anything without a provider, every committed story baseline for those
    // finish sections would move the moment this readout lands beside them.
    const { container } = renderReadout(LEFT_FACE, null)

    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when a provider exists but no sample has been resolved yet', () => {
    const store = createPerceivedColorStore()

    const { container } = renderReadout(LEFT_FACE, store)

    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the resolved sample belongs to a different surface', () => {
    // A stale sample must never be captioned with the wrong paint. Comparing a
    // wall's left and right faces (same wallId, different side) proves the
    // match is on the full surface identity, not merely the wall id.
    const store = createPerceivedColorStore()
    store.resolveSample({ surface: RIGHT_FACE, color: colorFromHex('#336699') })

    const { container } = renderReadout(LEFT_FACE, store)

    expect(container.firstChild).toBeNull()
  })

  it('renders a swatch chip exposing the sampled hex as text, a data-perceived attribute, and a matching background style', () => {
    const store = createPerceivedColorStore()
    const sample = colorFromHex('#a1b2c3')
    store.resolveSample({ surface: LEFT_FACE, color: sample })

    renderReadout(LEFT_FACE, store)

    const chip = screen.getByText(sample.srgbHex)
    expect(chip).toHaveAttribute('data-perceived', sample.srgbHex)
    expect(chip.style.backgroundColor).toBe(hexToRgb(sample.srgbHex))
  })

  it('renders the perceived-shift phrase derived from describePerceivedShift and perceivedShiftLabel when a reference color is given', () => {
    const store = createPerceivedColorStore()
    const reference = colorFromHex('#f5f5f5')
    const sample = colorFromHex('#1a1a2e')
    store.resolveSample({ surface: LEFT_FACE, color: sample })
    const expectedPhrase = perceivedShiftLabel(describePerceivedShift(sample, reference))
    // The chosen colors must actually disagree, or this test could pass with a
    // hardcoded "Reads as painted" label instead of a genuinely derived one.
    expect(expectedPhrase).not.toBe('Reads as painted')

    renderReadout(LEFT_FACE, store, reference)

    expect(screen.getByText(expectedPhrase)).toBeInTheDocument()
  })

  it('reads "Reads as painted" when the resolved sample is within tolerance of the reference', () => {
    const store = createPerceivedColorStore()
    const hex = '#7a5c3e'
    store.resolveSample({ surface: LEFT_FACE, color: colorFromHex(hex) })

    renderReadout(LEFT_FACE, store, colorFromHex(hex))

    expect(screen.getByText('Reads as painted')).toBeInTheDocument()
  })

  it('renders the swatch chip but no shift phrase when no reference color is given', () => {
    const store = createPerceivedColorStore()
    const sample = colorFromHex('#4c8f6a')
    store.resolveSample({ surface: LEFT_FACE, color: sample })

    renderReadout(LEFT_FACE, store)

    expect(screen.getByText(sample.srgbHex)).toBeInTheDocument()
    expect(screen.queryByText(/^reads /i)).toBeNull()
  })
})
