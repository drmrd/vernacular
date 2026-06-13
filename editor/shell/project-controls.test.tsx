import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProjectControls } from './project-controls'

const EXPORT_PLAN_LABEL = 'Export plan'
const EXPORT_IMAGE_LABEL = 'Export PNG'
const EXPORT_PDF_LABEL = 'Export PDF'

function projectNav() {
  return screen.getByRole('navigation', { name: 'Project' })
}

afterEach(cleanup)

describe('ProjectControls export plan action', () => {
  it('renders an Export plan button that calls onExportPlan when clicked', async () => {
    const onExportPlan = vi.fn()
    const user = userEvent.setup()
    render(<ProjectControls onExportPlan={onExportPlan} />)

    const exportPlanButton = within(projectNav()).getByRole('button', {
      name: EXPORT_PLAN_LABEL,
    })
    await user.click(exportPlanButton)

    expect(onExportPlan).toHaveBeenCalledTimes(1)
  })

  it('renders no Export plan button without the callback', () => {
    render(<ProjectControls />)

    expect(within(projectNav()).queryByRole('button', { name: EXPORT_PLAN_LABEL })).toBeNull()
  })
})

describe('ProjectControls export image action', () => {
  it('renders an Export PNG button that calls onExportImage when clicked', async () => {
    const onExportImage = vi.fn()
    const user = userEvent.setup()
    render(<ProjectControls onExportImage={onExportImage} />)

    const exportImageButton = within(projectNav()).getByRole('button', {
      name: EXPORT_IMAGE_LABEL,
    })
    await user.click(exportImageButton)

    expect(onExportImage).toHaveBeenCalledTimes(1)
  })

  it('renders no Export PNG button without the callback', () => {
    render(<ProjectControls />)

    expect(within(projectNav()).queryByRole('button', { name: EXPORT_IMAGE_LABEL })).toBeNull()
  })
})

describe('ProjectControls export PDF action', () => {
  it('renders an Export PDF button that calls onExportPdf when clicked', async () => {
    const onExportPdf = vi.fn()
    const user = userEvent.setup()
    render(<ProjectControls onExportPdf={onExportPdf} />)

    const exportPdfButton = within(projectNav()).getByRole('button', {
      name: EXPORT_PDF_LABEL,
    })
    await user.click(exportPdfButton)

    expect(onExportPdf).toHaveBeenCalledTimes(1)
  })

  it('renders no Export PDF button without the callback', () => {
    render(<ProjectControls />)

    expect(within(projectNav()).queryByRole('button', { name: EXPORT_PDF_LABEL })).toBeNull()
  })
})
