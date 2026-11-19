import { useEffect, type ReactElement } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, act, screen, within } from '@testing-library/react'
import type { SettingKey, SettingsService } from '../../session'
import { createSettingsService } from '../../session'
import { SettingsProvider, useSettingsService } from './settings-context'
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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function lastSetter<T>(seen: Recording<T>): (value: T) => void {
  const setter = seen.setters.at(-1)
  if (setter === undefined) throw new Error('the reader has not rendered')
  return setter
}

function providedReader<T>(
  service: SettingsService,
  key: SettingKey<T>,
  seen: Recording<T>,
): ReactElement {
  return (
    <SettingsProvider service={service}>
      <Reader settingKey={key} seen={seen} />
    </SettingsProvider>
  )
}

describe('the settings provider and hook', () => {
  it('shows the stored value at the first render', () => {
    const seen = recording<string>()

    render(providedReader(serviceHolding('greeting', 'stored'), GREETING, seen))

    expect(seen.values[0]).toBe('stored')
    expect(screen.getByRole('status')).toHaveTextContent('stored')
  })

  it('shows the default when nothing is stored', () => {
    const seen = recording<string>()

    render(providedReader(createSettingsService(), GREETING, seen))

    expect(seen.values[0]).toBe('hello')
    expect(screen.getByRole('status')).toHaveTextContent('hello')
  })

  it('a set through the hook reaches the service and renders the new value', () => {
    const service = createSettingsService()
    const seen = recording<string>()
    render(providedReader(service, GREETING, seen))

    act(() => {
      lastSetter(seen)('changed')
    })

    expect(service.get(GREETING)).toBe('changed')
    expect(seen.values.at(-1)).toBe('changed')
    expect(screen.getByRole('status')).toHaveTextContent('changed')
  })

  it('a set on the service from outside renders the new value', () => {
    const service = createSettingsService()
    const seen = recording<string>()
    render(providedReader(service, GREETING, seen))

    act(() => {
      service.set(GREETING, 'from outside')
    })

    expect(seen.values.at(-1)).toBe('from outside')
    expect(screen.getByRole('status')).toHaveTextContent('from outside')
  })

  it('a set of another key does not render the component again', () => {
    const service = createSettingsService()
    const seen = recording<string>()
    render(providedReader(service, GREETING, seen))
    const rendersAtStart = seen.values.length

    act(() => {
      service.set(VOLUME, 9)
    })
    expect(seen.values).toHaveLength(rendersAtStart)

    // The control: a set of its own key does render it again.
    act(() => {
      service.set(GREETING, 'own key')
    })
    expect(seen.values.length).toBeGreaterThan(rendersAtStart)
  })

  it('an unmount ends the subscription', () => {
    const { service, counts } = counting(createSettingsService())
    const view = render(providedReader(service, GREETING, recording<string>()))
    expect(counts.started).toBeGreaterThan(0)

    view.unmount()

    expect(counts.ended).toBe(counts.started)
  })

  it('gives the same setter on every render', () => {
    const service = createSettingsService()
    const seen = recording<string>()
    const view = render(providedReader(service, GREETING, seen))

    act(() => {
      service.set(GREETING, 'second render')
    })
    view.rerender(providedReader(service, GREETING, seen))

    expect(seen.setters.length).toBeGreaterThan(2)
    expect(new Set(seen.setters).size).toBe(1)
  })

  it('an object value renders once and does not loop', () => {
    const seen = recording<Frame>()

    render(providedReader(serviceHolding('frame', { width: 3 }), FRAME, seen))

    expect(seen.values).toHaveLength(1)
    expect(seen.values[0]).toEqual({ width: 3 })
  })

  it('shows the value of a new service when the provider gets one', () => {
    const first = serviceHolding('greeting', 'from the first')
    const second = serviceHolding('greeting', 'from the second')
    const seen = recording<string>()
    const view = render(providedReader(first, GREETING, seen))

    view.rerender(providedReader(second, GREETING, seen))
    expect(screen.getByRole('status')).toHaveTextContent('from the second')

    act(() => {
      first.set(GREETING, 'late news from the first')
    })
    expect(screen.getByRole('status')).toHaveTextContent('from the second')

    act(() => {
      second.set(GREETING, 'news from the second')
    })
    expect(screen.getByRole('status')).toHaveTextContent('news from the second')
  })
})

interface EchoProps {
  trigger: string
  reply: string
}

/** Sets `reply` at once when a change to `trigger` reaches it, so that a set happens during a delivery. */
function Echo({ trigger, reply }: EchoProps): null {
  const service = useSettingsService()
  useEffect(
    () =>
      service.subscribe(GREETING, (value) => {
        if (value === trigger) service.set(GREETING, reply)
      }),
    [service, trigger, reply],
  )
  return null
}

describe('the settings hook when a set happens during a delivery', () => {
  it('shows the value that the service holds, not the value that a notification carried', () => {
    const service = createSettingsService()
    const first = recording<string>()
    const second = recording<string>()
    render(
      <SettingsProvider service={service}>
        <Echo trigger="first" reply="second" />
        <Reader settingKey={GREETING} seen={first} />
        <Reader settingKey={GREETING} seen={second} />
      </SettingsProvider>,
    )

    act(() => {
      service.set(GREETING, 'first')
    })

    expect(service.get(GREETING)).toBe('second')
    expect(first.values.at(-1)).toBe('second')
    expect(second.values.at(-1)).toBe('second')
    for (const status of screen.getAllByRole('status')) {
      expect(status).toHaveTextContent('second')
    }
  })
})

describe('the settings hook without a provider', () => {
  it('without a provider it keeps a value for the life of the component', () => {
    const seen = recording<string>()
    const services: SettingsService[] = []
    const tree = (): ReactElement => (
      <>
        <ServiceProbe services={services} />
        <Reader settingKey={GREETING} seen={seen} />
      </>
    )
    const view = render(tree())

    act(() => {
      lastSetter(seen)('kept')
    })
    view.rerender(tree())

    expect(screen.getByRole('status')).toHaveTextContent('kept')
    expect(seen.values.at(-1)).toBe('kept')
    expect(services.length).toBeGreaterThan(1)
    expect(new Set(services).size).toBe(1)
  })

  it('without a provider two mounted trees do not share a value', () => {
    const firstSeen = recording<string>()
    const secondSeen = recording<string>()
    const firstServices: SettingsService[] = []
    const secondServices: SettingsService[] = []
    const treeOf = (seen: Recording<string>, services: SettingsService[]): ReactElement => (
      <>
        <ServiceProbe services={services} />
        <Reader settingKey={GREETING} seen={seen} />
      </>
    )
    const firstTree = render(treeOf(firstSeen, firstServices))
    const secondTree = render(treeOf(secondSeen, secondServices))

    act(() => {
      lastSetter(firstSeen)('first tree only')
    })

    expect(within(firstTree.container).getByRole('status')).toHaveTextContent('first tree only')
    expect(within(secondTree.container).getByRole('status')).toHaveTextContent('hello')
    expect(secondSeen.values.at(-1)).toBe('hello')
    expect(secondServices[0]).not.toBe(firstServices[0])
  })

  it('without a provider it calls no browser storage', () => {
    const reads = vi.spyOn(Storage.prototype, 'getItem')
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    const seen = recording<string>()
    render(<Reader settingKey={GREETING} seen={seen} />)

    act(() => {
      lastSetter(seen)('memory only')
    })

    expect(screen.getByRole('status')).toHaveTextContent('memory only')
    expect(reads).not.toHaveBeenCalled()
    expect(writes).not.toHaveBeenCalled()
  })
})
