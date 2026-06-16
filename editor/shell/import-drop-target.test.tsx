import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ImportDropTarget } from './import-drop-target'

afterEach(cleanup)

describe('ImportDropTarget', () => {
  it('renders its children', () => {
    render(
      <ImportDropTarget onImportDroppedFile={vi.fn()}>
        <div>canvas</div>
      </ImportDropTarget>,
    )
    expect(screen.getByText('canvas')).toBeInTheDocument()
  })

  it('shows the drop overlay while files are dragged over and hides it on drag leave', () => {
    render(
      <ImportDropTarget onImportDroppedFile={vi.fn()}>
        <div>canvas</div>
      </ImportDropTarget>,
    )
    const target = screen.getByTestId('import-drop-target')

    fireEvent.dragEnter(target, { dataTransfer: { types: ['Files'] } })
    expect(screen.getByText(/drop to open project/i)).toBeInTheDocument()

    fireEvent.dragLeave(target, { dataTransfer: { types: ['Files'] } })
    expect(screen.queryByText(/drop to open project/i)).not.toBeInTheDocument()
  })

  it('routes the first dropped file to onImportDroppedFile', () => {
    const onImport = vi.fn()
    const buildingFile = new File([], 'house.building')
    render(
      <ImportDropTarget onImportDroppedFile={onImport}>
        <div>canvas</div>
      </ImportDropTarget>,
    )
    const target = screen.getByTestId('import-drop-target')

    fireEvent.dragEnter(target, { dataTransfer: { types: ['Files'] } })
    fireEvent.drop(target, { dataTransfer: { files: [buildingFile] } })

    expect(onImport).toHaveBeenCalledWith(buildingFile)
  })
})
