import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useUnderlay, type UnderlayContextValue } from './use-underlay'

afterEach(cleanup)

function Probe({ onValue }: { onValue: (value: UnderlayContextValue) => void }) {
  onValue(useUnderlay())
  return null
}

describe('useUnderlay context value', () => {
  it('omits trace-mode controls now that underlay-corner snapping is a snap preference', () => {
    let captured: UnderlayContextValue | undefined
    render(<Probe onValue={(value) => (captured = value)} />)

    const value = captured as UnderlayContextValue
    expect('traceMode' in value).toBe(false)
    expect('setTraceMode' in value).toBe(false)
  })
})
