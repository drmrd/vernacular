import { StrictMode, type ReactElement } from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, act, screen } from '@testing-library/react'
import type { SettingKey, SettingsService } from '../../session'
import { createSettingsService } from '../../session'
import { InMemorySettingsPort } from '../../session/testing'
import { SettingsProvider, useSetting, useSettingsService } from './settings-context'

afterEach(cleanup)

/** More renders than any settled tree needs; a loop would pass it. */
const RENDER_BOUND = 10

const GREETING: SettingKey<string> = {
  name: 'greeting',
  defaultValue: 'hello',
  parse: (raw) => (typeof raw === 'string' ? raw : undefined),
}

const VOLUME: SettingKey<number> = {
  name: 'volume',
  defaultValue: 5,
  parse: (raw) => (typeof raw === 'number' ? raw : undefined),
}

interface Frame {
  readonly width: number
}

const FRAME: SettingKey<Frame> = {
  name: 'frame',
  defaultValue: { width: 1 },
  parse: (raw) =>
    typeof raw === 'object' && raw !== null && 'width' in raw && typeof raw.width === 'number'
      ? { width: raw.width }
      : undefined,
}

/** A key with the same name, default, and parse as GREETING, but a new object each time. */
function freshGreetingKey(): SettingKey<string> {
  return {
    name: GREETING.name,
    defaultValue: GREETING.defaultValue,
    parse: (raw) => (typeof raw === 'string' ? raw : undefined),
  }
}

function serviceHolding(name: string, stored: unknown): SettingsService {
  const port = new InMemorySettingsPort()
  port.write(name, stored)
  return createSettingsService(port)
}

interface SubscriptionCounts {
  started: number
  ended: number
}

/** A service that counts each subscription that starts and each one that ends. */
function counting(service: SettingsService): {
  service: SettingsService
  counts: SubscriptionCounts
} {
  const counts: SubscriptionCounts = { started: 0, ended: 0 }
  const counted: SettingsService = {
    get: (key) => service.get(key),
    set: (key, value) => {
      service.set(key, value)
    },
    subscribe: (key, listener) => {
      counts.started += 1
      const end = service.subscribe(key, listener)
      return () => {
        counts.ended += 1
        end()
      }
    },
  }
  return { service: counted, counts }
}

/** The values a reader rendered, in order. */
function Reader<T>({ settingKey, seen }: { settingKey: SettingKey<T>; seen: T[] }): ReactElement {
  const [value] = useSetting(settingKey)
  seen.push(value)
  return <output>{String(value)}</output>
}

function ServiceProbe({ services }: { services: SettingsService[] }): null {
  services.push(useSettingsService())
  return null
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
    const seen: string[] = []
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

function FreshKeyReader({ seen }: { seen: string[] }): ReactElement {
  return <Reader settingKey={freshGreetingKey()} seen={seen} />
}

describe('a setting key that is new on every render', () => {
  it('shows the stored value, stays stable, and does not loop', () => {
    const service = serviceHolding('greeting', 'stored')
    const seen: string[] = []
    const tree = (): ReactElement => (
      <SettingsProvider service={service}>
        <FreshKeyReader seen={seen} />
      </SettingsProvider>
    )
    const view = render(tree())
    view.rerender(tree())
    view.rerender(tree())

    expect(new Set(seen)).toEqual(new Set(['stored']))
    expect(seen.length).toBeLessThan(RENDER_BOUND)

    act(() => {
      service.set(GREETING, 'from outside')
    })

    expect(screen.getByRole('status')).toHaveTextContent('from outside')
    expect(seen.at(-1)).toBe('from outside')
    expect(seen.length).toBeLessThan(RENDER_BOUND)
  })
})

describe('the settings hook under StrictMode', () => {
  it('shows the stored value at the first committed render', () => {
    const seen: string[] = []

    render(
      <StrictMode>
        <SettingsProvider service={serviceHolding('greeting', 'stored')}>
          <Reader settingKey={GREETING} seen={seen} />
        </SettingsProvider>
      </StrictMode>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('stored')
    expect(seen[0]).toBe('stored')
  })

  it('does not loop on an object value', () => {
    const seen: Frame[] = []

    render(
      <StrictMode>
        <SettingsProvider service={serviceHolding('frame', { width: 3 })}>
          <Reader settingKey={FRAME} seen={seen} />
        </SettingsProvider>
      </StrictMode>,
    )

    expect(seen.length).toBeLessThan(RENDER_BOUND)
    expect(seen.at(-1)).toEqual({ width: 3 })
  })

  it('ends every subscription that it made after an unmount', () => {
    const { service, counts } = counting(createSettingsService())
    const view = render(
      <StrictMode>
        <SettingsProvider service={service}>
          <Reader settingKey={GREETING} seen={[]} />
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
    const seen: Array<string | number> = []
    const tree = (key: SettingKey<string | number>): ReactElement => (
      <SettingsProvider service={service}>
        <Reader settingKey={key} seen={seen} />
      </SettingsProvider>
    )
    const view = render(tree(GREETING as SettingKey<string | number>))
    view.rerender(tree(VOLUME as SettingKey<string | number>))
    const rendersAfterChange = seen.length

    act(() => {
      service.set(GREETING, 'old key')
    })
    expect(seen).toHaveLength(rendersAfterChange)

    act(() => {
      service.set(VOLUME, 9)
    })
    expect(seen.length).toBeGreaterThan(rendersAfterChange)
    expect(seen.at(-1)).toBe(9)

    view.unmount()
    expect(counts.ended).toBe(counts.started)
  })
})
