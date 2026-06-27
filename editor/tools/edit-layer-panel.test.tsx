import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditLayerProvider } from './edit-layer-provider'
import { useActiveEditLayer } from './edit-layer-context'
import { EditLayerPanel } from './edit-layer-panel'

afterEach(cleanup)

const NON_DEFAULT_LAYER_NAMES = [/^walls$/i, /^openings$/i, /^decor$/i, /^annotations$/i]

function renderPanel() {
  return render(
    <EditLayerProvider>
      <EditLayerPanel />
    </EditLayerProvider>,
  )
}

describe('EditLayerPanel', () => {
  it('groups the five edit layers as radios inside an Edit layer radiogroup', () => {
    renderPanel()

    expect(screen.getByRole('radiogroup', { name: /edit layer/i })).toBeInTheDocument()
    for (const name of [/^all$/i, ...NON_DEFAULT_LAYER_NAMES]) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument()
    }
  })

  it('defaults to the All layer checked and the rest unchecked', () => {
    renderPanel()

    expect(screen.getByRole('radio', { name: /^all$/i })).toHaveAttribute('aria-checked', 'true')
    for (const name of NON_DEFAULT_LAYER_NAMES) {
      expect(screen.getByRole('radio', { name })).toHaveAttribute('aria-checked', 'false')
    }
  })

  it('marks the clicked layer checked and all others unchecked', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('radio', { name: /^walls$/i }))

    expect(screen.getByRole('radio', { name: /^walls$/i })).toHaveAttribute('aria-checked', 'true')
    for (const name of [/^all$/i, /^openings$/i, /^decor$/i, /^annotations$/i]) {
      expect(screen.getByRole('radio', { name })).toHaveAttribute('aria-checked', 'false')
    }
  })

  it('renders an edit layer section label through the SectionLabel primitive', () => {
    const { container } = renderPanel()

    const sectionLabels = Array.from(container.querySelectorAll('.ds-section-label'))
    const labels = sectionLabels.map((el) => el.textContent?.toLowerCase() ?? '')

    expect(labels).toContain('edit layer')
  })

  it('routes layer radios through the shared segmented option treatment', () => {
    renderPanel()

    for (const name of [/^all$/i, ...NON_DEFAULT_LAYER_NAMES]) {
      expect(screen.getByRole('radio', { name })).toHaveClass('ds-segmented__option')
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
