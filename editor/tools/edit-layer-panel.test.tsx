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

  it('keeps only the checked radio in the tab order (roving tabindex)', () => {
    renderPanel()

    expect(screen.getByRole('radio', { name: /^all$/i })).toHaveAttribute('tabindex', '0')
    for (const name of NON_DEFAULT_LAYER_NAMES) {
      expect(screen.getByRole('radio', { name })).toHaveAttribute('tabindex', '-1')
    }
  })

  it('moves selection and focus to the next layer on ArrowRight', async () => {
    const user = userEvent.setup()
    renderPanel()

    screen.getByRole('radio', { name: /^all$/i }).focus()
    await user.keyboard('{ArrowRight}')

    const walls = screen.getByRole('radio', { name: /^walls$/i })
    expect(walls).toHaveFocus()
    expect(walls).toHaveAttribute('aria-checked', 'true')
    expect(walls).toHaveAttribute('tabindex', '0')
    const all = screen.getByRole('radio', { name: /^all$/i })
    expect(all).toHaveAttribute('aria-checked', 'false')
    expect(all).toHaveAttribute('tabindex', '-1')
  })

  it('moves selection and focus to the next layer on ArrowDown', async () => {
    const user = userEvent.setup()
    renderPanel()

    screen.getByRole('radio', { name: /^all$/i }).focus()
    await user.keyboard('{ArrowDown}')

    expect(screen.getByRole('radio', { name: /^walls$/i })).toHaveFocus()
    expect(screen.getByRole('radio', { name: /^walls$/i })).toHaveAttribute('aria-checked', 'true')
  })

  it('wraps to the last layer when moving before the first on ArrowLeft', async () => {
    const user = userEvent.setup()
    renderPanel()

    screen.getByRole('radio', { name: /^all$/i }).focus()
    await user.keyboard('{ArrowLeft}')

    const annotations = screen.getByRole('radio', { name: /^annotations$/i })
    expect(annotations).toHaveFocus()
    expect(annotations).toHaveAttribute('aria-checked', 'true')
  })

  it('jumps to the last layer on End and the first on Home', async () => {
    const user = userEvent.setup()
    renderPanel()

    screen.getByRole('radio', { name: /^all$/i }).focus()
    await user.keyboard('{End}')
    expect(screen.getByRole('radio', { name: /^annotations$/i })).toHaveFocus()

    await user.keyboard('{Home}')
    expect(screen.getByRole('radio', { name: /^all$/i })).toHaveFocus()
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
