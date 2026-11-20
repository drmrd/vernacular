import { StrictMode, type ReactElement } from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, act, screen } from '@testing-library/react'
import type { SettingKey, SettingsService } from '../../session'
import { createSettingsService } from '../../session'
import { SettingsProvider, useSetting } from './settings-context'
import { Reader, ServiceProbe } from './settings-context-test-support'
import {
  counting,
  FRAME,
  GREETING,
  VOLUME,
  recording,
  serviceHolding,
  type Frame,
  type Recording,
} from './settings-context-fixtures-test-support'

afterEach(cleanup)

/** More renders than any settled tree needs; a loop would pass it. */
const RENDER_BOUND = 10

/** A key with the same name, default, and parse as GREETING, but a new object each time. */
function freshGreetingKey(): SettingKey<string> {
  return {
    name: GREETING.name,
    defaultValue: GREETING.defaultValue,
    parse: (raw) => (typeof raw === 'string' ? raw : undefined),
  }
}

describe('the nearest settings provider', () => {
  it('gives the service of the provider to useSettingsService', () => {
    const service = createSettingsService()
    const services: SettingsService[] = []

    render(
      <SettingsProvider service={service}>
        <ServiceProbe services={services} />
      </SettingsProvider>,
    )

    expect(services.length).toBeGreaterThan(0)
    for (const given of services) expect(given).toBe(service)
  })

  it('uses the inner provider when two providers are nested', () => {
    const outer = serviceHolding('greeting', 'from the outer')
    const inner = serviceHolding('greeting', 'from the inner')
    const seen = recording<string>()
    const services: SettingsService[] = []

    render(
      <SettingsProvider service={outer}>
        <SettingsProvider service={inner}>
          <ServiceProbe services={services} />
          <Reader settingKey={GREETING} seen={seen} />
        </SettingsProvider>
      </SettingsProvider>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('from the inner')
    expect(services.length).toBeGreaterThan(0)
    for (const given of services) expect(given).toBe(inner)
  })
})

function FreshKeyReader({ seen }: { seen: Recording<string> }): ReactElement {
  return <Reader settingKey={freshGreetingKey()} seen={seen} />
}

describe('a setting key that is new on every render', () => {
  it('shows the stored value, stays stable, and does not loop', () => {
    const service = serviceHolding('greeting', 'stored')
    const seen = recording<string>()
    const tree = (): ReactElement => (
      <SettingsProvider service={service}>
        <FreshKeyReader seen={seen} />
      </SettingsProvider>
    )
    const view = render(tree())
    view.rerender(tree())
    view.rerender(tree())

    expect(new Set(seen.values)).toEqual(new Set(['stored']))
    expect(seen.values.length).toBeLessThan(RENDER_BOUND)

    act(() => {
      service.set(GREETING, 'from outside')
    })

    expect(screen.getByRole('status')).toHaveTextContent('from outside')
    expect(seen.values.at(-1)).toBe('from outside')
    expect(seen.values.length).toBeLessThan(RENDER_BOUND)
  })
})

describe('the settings hook under StrictMode', () => {
  it('shows the stored value at the first committed render', () => {
    const seen = recording<string>()

    render(
      <StrictMode>
        <SettingsProvider service={serviceHolding('greeting', 'stored')}>
          <Reader settingKey={GREETING} seen={seen} />
        </SettingsProvider>
      </StrictMode>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('stored')
    expect(seen.values[0]).toBe('stored')
  })

  it('does not loop on an object value', () => {
    const seen = recording<Frame>()

    render(
      <StrictMode>
        <SettingsProvider service={serviceHolding('frame', { width: 3 })}>
          <Reader settingKey={FRAME} seen={seen} />
        </SettingsProvider>
      </StrictMode>,
    )

    expect(seen.values.length).toBeLessThan(RENDER_BOUND)
    expect(seen.values.at(-1)).toEqual({ width: 3 })
  })

  it('ends every subscription that it made after an unmount', () => {
    const { service, counts } = counting(createSettingsService())
    const view = render(
      <StrictMode>
        <SettingsProvider service={service}>
          <Reader settingKey={GREETING} seen={recording<string>()} />
        </SettingsProvider>
      </StrictMode>,
    )
    expect(counts.started).toBeGreaterThan(0)

    view.unmount()

    expect(counts.ended).toBe(counts.started)
  })
})

/** Two calls of the hook with the same key in one component. */
function TwoCalls({ setters }: { setters: Array<(value: string) => void> }): ReactElement {
  const [first, setFirst] = useSetting(GREETING)
  const [second] = useSetting(GREETING)
  setters.push(setFirst)
  return (
    <>
      <output aria-label="first call">{first}</output>
      <output aria-label="second call">{second}</output>
    </>
  )
}

function setThroughFirstCall(setters: Array<(value: string) => void>, value: string): void {
  const setter = setters.at(-1)
  if (setter === undefined) throw new Error('the component has not rendered')
  act(() => {
    setter(value)
  })
}

describe('two calls of the hook in one component', () => {
  it('do not share a value in a tree with no provider (a limit)', () => {
    const setters: Array<(value: string) => void> = []
    render(<TwoCalls setters={setters} />)

    setThroughFirstCall(setters, 'changed')

    expect(screen.getByLabelText('first call')).toHaveTextContent('changed')
    expect(screen.getByLabelText('second call')).toHaveTextContent('hello')
  })

  it('share a value under a provider', () => {
    const setters: Array<(value: string) => void> = []
    render(
      <SettingsProvider service={createSettingsService()}>
        <TwoCalls setters={setters} />
      </SettingsProvider>,
    )

    setThroughFirstCall(setters, 'changed')

    expect(screen.getByLabelText('first call')).toHaveTextContent('changed')
    expect(screen.getByLabelText('second call')).toHaveTextContent('changed')
  })
})

describe('the settings hook when the key changes', () => {
  it('follows the new key only, and ends every subscription at the unmount', () => {
    const { service, counts } = counting(createSettingsService())
    const seen = recording<string | number>()
    const tree = (key: SettingKey<string | number>): ReactElement => (
      <SettingsProvider service={service}>
        <Reader settingKey={key} seen={seen} />
      </SettingsProvider>
    )
    const view = render(tree(GREETING as SettingKey<string | number>))
    view.rerender(tree(VOLUME as SettingKey<string | number>))
    const rendersAfterChange = seen.values.length

    act(() => {
      service.set(GREETING, 'old key')
    })
    expect(seen.values).toHaveLength(rendersAfterChange)

    act(() => {
      service.set(VOLUME, 9)
    })
    expect(seen.values.length).toBeGreaterThan(rendersAfterChange)
    expect(seen.values.at(-1)).toBe(9)

    view.unmount()
    expect(counts.ended).toBe(counts.started)
  })
})
