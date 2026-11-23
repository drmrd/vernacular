import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ScenePaneFailureView } from './scene-pane-failure-view'
import {
  LOAD_DESCRIPTION,
  LOAD_TITLE,
  START_DESCRIPTION,
  START_TITLE,
} from './scene-failure-text-test-support'

describe('ScenePaneFailureView', () => {
  it('shows the could-not-load title, what to do, and a Reload page button of the design system', () => {
    const onReload = vi.fn()

    const { container } = render(<ScenePaneFailureView kind="load" onReload={onReload} />)

    expect(screen.getByRole('heading', { level: 2, name: LOAD_TITLE })).toBeInTheDocument()
    expect(screen.getByText(LOAD_DESCRIPTION)).toBeInTheDocument()
    const reload = screen.getByRole('button', { name: 'Reload page' })
    expect(reload).toHaveClass('ds-button')
    expect(reload).toHaveClass('ds-button--primary')
    fireEvent.click(reload)
    expect(onReload).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.ds-status')).not.toBeNull()
  })

  it('shows the cannot-render title and reassurance with no button', () => {
    render(<ScenePaneFailureView kind="start" />)

    expect(screen.getByRole('heading', { level: 2, name: START_TITLE })).toBeInTheDocument()
    expect(screen.getByText(START_DESCRIPTION)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it.each([{ kind: 'load' as const, onReload: vi.fn() }, { kind: 'start' as const }])(
    'carries no live role and no region landmark of its own ($kind)',
    (props) => {
      render(<ScenePaneFailureView {...props} />)

      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.queryByRole('status')).toBeNull()
      expect(screen.queryByRole('region')).toBeNull()
    },
  )
})
