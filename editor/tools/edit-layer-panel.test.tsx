import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditLayerProvider } from './edit-layer-provider'
import { useActiveEditLayer } from './edit-layer-context'
import { EditLayerPanel } from './edit-layer-panel'

afterEach(cleanup)

const NON_DEFAULT_LAYER_NAMES = [/^walls$/i, /^openings$/i, /^decor$/i, /^annotations$/i]

describe('EditLayerPanel', () => {
  it('renders a button for each of the five edit layers', () => {
    render(
      <EditLayerProvider>
        <EditLayerPanel />
      </EditLayerProvider>,
    )

    for (const name of [/^all$/i, ...NON_DEFAULT_LAYER_NAMES]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('defaults to the All layer pressed and the rest unpressed', () => {
    render(
      <EditLayerProvider>
        <EditLayerPanel />
      </EditLayerProvider>,
    )

    expect(screen.getByRole('button', { name: /^all$/i })).toHaveAttribute('aria-pressed', 'true')
    for (const name of NON_DEFAULT_LAYER_NAMES) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('marks the clicked layer pressed and all others unpressed', async () => {
    const user = userEvent.setup()
    render(
      <EditLayerProvider>
        <EditLayerPanel />
      </EditLayerProvider>,
    )

    await user.click(screen.getByRole('button', { name: /^walls$/i }))

    expect(screen.getByRole('button', { name: /^walls$/i })).toHaveAttribute('aria-pressed', 'true')
    for (const name of [/^all$/i, /^openings$/i, /^decor$/i, /^annotations$/i]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('renders an edit layer section label through the SectionLabel primitive', () => {
    const { container } = render(
      <EditLayerProvider>
        <EditLayerPanel />
      </EditLayerProvider>,
    )

    const sectionLabels = Array.from(container.querySelectorAll('.ds-section-label'))
    const labels = sectionLabels.map((el) => el.textContent?.toLowerCase() ?? '')

    expect(labels).toContain('edit layer')
  })

  it('routes layer chips through the shared segmented option treatment', () => {
    render(
      <EditLayerProvider>
        <EditLayerPanel />
      </EditLayerProvider>,
    )

    for (const name of [/^all$/i, ...NON_DEFAULT_LAYER_NAMES]) {
      expect(screen.getByRole('button', { name })).toHaveClass('ds-segmented__option')
    }
  })
})

describe('useActiveEditLayer', () => {
  it('throws when used outside an EditLayerProvider', () => {
    function Orphan() {
      useActiveEditLayer()
      return null
    }
    expect(() => render(<Orphan />)).toThrow(/EditLayerProvider/)
  })
})
