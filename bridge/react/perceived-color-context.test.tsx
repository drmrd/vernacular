import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { colorFromHex } from '../../core'
import type { SurfaceRef } from '../../core'
import { createPerceivedColorStore } from '../perceived-color/perceived-color-store'
import {
  PerceivedColorContext,
  usePerceivedColorStore,
  usePerceivedColorSample,
} from './perceived-color-context'

afterEach(cleanup)

const wallFaceLeft: SurfaceRef = { kind: 'wall-face', wallId: 'w1', side: 'left' }
const sampledColor = colorFromHex('#8899aa')

function StoreReadout() {
  const store = usePerceivedColorStore()
  return <span>{store === null ? 'no-store' : 'has-store'}</span>
}

function SampleReadout() {
  const sample = usePerceivedColorSample()
  return <span>{sample === null ? 'no-sample' : sample.color.srgbHex}</span>
}

describe('usePerceivedColorStore', () => {
  it('returns null outside a provider so the readout degrades gracefully instead of crashing', () => {
    // Unlike useSurfaceSelection, which throws outside its provider, the
    // perceived-color readout is an optional enhancement layered on top of
    // paint editing. A finish panel rendered in isolation (a Storybook
    // story, a component test that never mounts the 3D scene) has no
    // rendered pixels to sample from and must still render its normal
    // controls rather than blow up for lack of a provider it does not
    // strictly need.
    render(<StoreReadout />)
    expect(screen.getByText('no-store')).toBeInTheDocument()
  })

  it('returns the provided store when a provider is present', () => {
    const store = createPerceivedColorStore()
    render(
      <PerceivedColorContext.Provider value={store}>
        <StoreReadout />
      </PerceivedColorContext.Provider>,
    )
    expect(screen.getByText('has-store')).toBeInTheDocument()
  })
})

describe('usePerceivedColorSample', () => {
  it('returns null outside a provider', () => {
    render(<SampleReadout />)
    expect(screen.getByText('no-sample')).toBeInTheDocument()
  })

  it('returns null when a provider is present but no sample has been resolved yet', () => {
    const store = createPerceivedColorStore()
    render(
      <PerceivedColorContext.Provider value={store}>
        <SampleReadout />
      </PerceivedColorContext.Provider>,
    )
    expect(screen.getByText('no-sample')).toBeInTheDocument()
  })

  it('re-renders with the resolved sample once the store resolves one', () => {
    const store = createPerceivedColorStore()
    render(
      <PerceivedColorContext.Provider value={store}>
        <SampleReadout />
      </PerceivedColorContext.Provider>,
    )
    expect(screen.getByText('no-sample')).toBeInTheDocument()

    act(() => {
      store.resolveSample({ surface: wallFaceLeft, color: sampledColor })
    })

    expect(screen.getByText(sampledColor.srgbHex)).toBeInTheDocument()
  })

  it('goes back to null and re-renders after the store is cleared', () => {
    const store = createPerceivedColorStore()
    render(
      <PerceivedColorContext.Provider value={store}>
        <SampleReadout />
      </PerceivedColorContext.Provider>,
    )
    act(() => {
      store.resolveSample({ surface: wallFaceLeft, color: sampledColor })
    })
    expect(screen.getByText(sampledColor.srgbHex)).toBeInTheDocument()

    act(() => {
      store.clear()
    })

    expect(screen.getByText('no-sample')).toBeInTheDocument()
  })
})
