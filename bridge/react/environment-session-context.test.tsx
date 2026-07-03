import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { DEFAULT_ENVIRONMENT_STATE, type EnvironmentState } from '../../core'
import { createEnvironmentSessionStore } from '../environment/environment-session-store'
import { EnvironmentSessionProvider } from './environment-session-provider'
import { useEnvironmentSession } from './environment-session-context'

afterEach(cleanup)

const overcastAfternoon: EnvironmentState = {
  mode: 'realistic',
  observedAt: { date: '2026-12-04', minutesSinceMidnight: 960 },
  cloudCover: 0.6,
  colorCheck: true,
}

function ModeReadout() {
  const { environment } = useEnvironmentSession()
  return <span>{environment.mode}</span>
}

describe('EnvironmentSessionProvider', () => {
  it('shares an environment session store and re-renders consumers on change', () => {
    const store = createEnvironmentSessionStore()
    render(
      <EnvironmentSessionProvider store={store}>
        <ModeReadout />
      </EnvironmentSessionProvider>,
    )

    expect(screen.getByText(DEFAULT_ENVIRONMENT_STATE.mode)).toBeInTheDocument()
    act(() => {
      store.setEnvironment(overcastAfternoon)
    })
    expect(screen.getByText(overcastAfternoon.mode)).toBeInTheDocument()
  })

  it('throws when useEnvironmentSession is used outside a provider', () => {
    function Orphan() {
      useEnvironmentSession()
      return null
    }
    expect(() => render(<Orphan />)).toThrow(/EnvironmentSessionProvider/)
  })
})
