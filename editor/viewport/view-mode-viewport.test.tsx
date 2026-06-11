import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewModeProvider } from './view-mode'
import { ViewModeViewport } from './view-mode-viewport'

afterEach(cleanup)

function renderViewport() {
  return render(
    <ViewModeProvider>
      <ViewModeViewport
        plan={<div>PLAN CONTENT</div>}
        preview={<section aria-label="3D preview">3D CONTENT</section>}
      />
    </ViewModeProvider>,
  )
}

describe('ViewModeViewport', () => {
  it('shows the three mode buttons with the current mode pressed', () => {
    renderViewport()

    expect(screen.getByRole('button', { name: 'Plan view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Split view' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: '3D view' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows only the plan in plan mode', () => {
    renderViewport()

    expect(screen.getByText('PLAN CONTENT')).toBeInTheDocument()
    expect(screen.queryByLabelText('3D preview')).toBeNull()
  })

  it('reveals the 3D preview in 3D mode', async () => {
    const user = userEvent.setup()
    renderViewport()

    await user.click(screen.getByRole('button', { name: '3D view' }))

    expect(screen.getByLabelText('3D preview')).toBeVisible()
    expect(screen.queryByText('PLAN CONTENT')).toBeNull()
  })

  it('shows both panes in split mode', async () => {
    const user = userEvent.setup()
    renderViewport()

    await user.click(screen.getByRole('button', { name: 'Split view' }))

    expect(screen.getByText('PLAN CONTENT')).toBeInTheDocument()
    const preview = screen.getByLabelText('3D preview')
    expect(within(preview).getByText('3D CONTENT')).toBeInTheDocument()
  })

  it('returns to plan and hides the preview', async () => {
    const user = userEvent.setup()
    renderViewport()

    await user.click(screen.getByRole('button', { name: '3D view' }))
    await user.click(screen.getByRole('button', { name: 'Plan view' }))

    expect(screen.queryByLabelText('3D preview')).toBeNull()
  })

  it('exposes the split position on the separator for assistive tech', async () => {
    const user = userEvent.setup()
    renderViewport()

    await user.click(screen.getByRole('button', { name: 'Split view' }))

    const separator = screen.getByRole('separator')
    expect(separator).toHaveAttribute('aria-valuenow', '60')
    expect(separator).toHaveAttribute('aria-valuemin', '30')
    expect(separator).toHaveAttribute('aria-valuemax', '80')
  })

  it('resizes the split with the arrow keys', async () => {
    const user = userEvent.setup()
    renderViewport()

    await user.click(screen.getByRole('button', { name: 'Split view' }))

    const separator = screen.getByRole('separator')
    separator.focus()

    await user.keyboard('{ArrowRight}')
    expect(separator).toHaveAttribute('aria-valuenow', '65')

    await user.keyboard('{ArrowLeft}')
    expect(separator).toHaveAttribute('aria-valuenow', '60')
  })
})
