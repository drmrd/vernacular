import { describe, it, expect, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import { renderPanelInProject } from './tools-panel-test-support'

afterEach(cleanup)

const GROUND_ELEVATION_MM = 0

describe('ToolsPanel unavailable chip reasons', () => {
  it.each([
    ['a chip with a caller reason', /stairs/i, 'Add a floor above to place stairs'],
    ['a planned chip', /fireplace/i, 'Planned, not yet available'],
  ])('describes %s through an element holding exactly the reason', (_case, name, reason) => {
    renderPanelInProject([GROUND_ELEVATION_MM], 0)

    const chip = screen.getByRole('radio', { name })
    const describedBy = chip.getAttribute('aria-describedby')

    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy ?? '')?.textContent).toBe(reason)
    expect(chip).toHaveAttribute('title', reason)
  })
})
