import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SceneFailureHost } from './scene-failure-host'
import {
  FailureProbe,
  PLAIN_CANNOT_RENDER,
  PLAIN_COULD_NOT_LOAD,
} from './scene-failure-probe-test-support'
import { SceneFailureViewContext, type SceneFailureViewProps } from './scene-failure-view-context'

describe('SceneFailureHost', () => {
  it('shows the plain cannot-render status when nothing fills the slot', () => {
    render(<SceneFailureHost kind="start" />)

    expect(screen.getByRole('status')).toHaveTextContent(PLAIN_CANNOT_RENDER)
    expect(screen.queryByRole('button', { name: 'Reload page' })).toBeNull()
  })

  it('shows the plain could-not-load alert and reloads through onReload when nothing fills the slot', () => {
    const onReload = vi.fn()

    render(<SceneFailureHost kind="load" onReload={onReload} />)

    expect(screen.getByRole('alert')).toHaveTextContent(PLAIN_COULD_NOT_LOAD)
    fireEvent.click(screen.getByRole('button', { name: 'Reload page' }))
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  const markedRows: { props: SceneFailureViewProps; role: string }[] = [
    { props: { kind: 'start' }, role: 'status' },
    { props: { kind: 'load', onReload: vi.fn() }, role: 'alert' },
  ]

  it.each(markedRows)(
    'marks the element around the view with the failure kind and fills its parent ($props.kind)',
    ({ props, role }) => {
      const { container } = render(<SceneFailureHost {...props} />)

      const marked = container.querySelector<HTMLElement>(
        `[data-scene-renderer-failed="${props.kind}"]`,
      )
      expect(marked).not.toBeNull()
      expect(marked?.contains(screen.getByRole(role))).toBe(true)
      expect(marked?.style.width).toBe('100%')
      expect(marked?.style.height).toBe('100%')
    },
  )

  it('renders the view that fills the slot, with the same props, inside the marked element', () => {
    const onReload = vi.fn()

    const { container } = render(
      <SceneFailureViewContext.Provider value={FailureProbe}>
        <SceneFailureHost kind="load" onReload={onReload} />
      </SceneFailureViewContext.Provider>,
    )

    const marked = container.querySelector('[data-scene-renderer-failed="load"]')
    const button = screen.getByRole('button', { name: 'filled view' })
    expect(marked?.contains(button)).toBe(true)
    expect(button).toHaveAttribute('data-kind', 'load')
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(button)
    expect(onReload).toHaveBeenCalledTimes(1)
  })
})
