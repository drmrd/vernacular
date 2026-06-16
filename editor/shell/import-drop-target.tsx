import { useState, type DragEvent, type ReactNode } from 'react'
import './import-drop-target.css'

interface ImportDropTargetProps {
  onImportDroppedFile?: ((file: File) => void) | undefined
  children: ReactNode
}

// True when a drag carries files, the only kind of drag this target reacts to.
function carriesFiles(event: DragEvent<HTMLDivElement>): boolean {
  return event.dataTransfer?.types?.includes('Files') ?? false
}

// Wraps the viewport so a project file dragged onto it loads as the active project.
// While a file drag is over the area, an overlay invites the drop; the overlay only
// renders while dragging, so it never blocks the children's pointer flow otherwise.
export function ImportDropTarget({ onImportDroppedFile, children }: ImportDropTargetProps) {
  const [dragging, setDragging] = useState(false)

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer?.files?.[0]
    if (file) {
      onImportDroppedFile?.(file)
    }
  }

  return (
    <div
      data-testid="import-drop-target"
      className="import-drop-target"
      style={{ width: '100%', height: '100%' }}
      onDragOver={(event) => event.preventDefault()}
      onDragEnter={(event) => carriesFiles(event) && setDragging(true)}
      onDragLeave={(event) => carriesFiles(event) && setDragging(false)}
      onDrop={handleDrop}
    >
      {children}
      {dragging ? <div className="import-drop-target__overlay">Drop to open project</div> : null}
    </div>
  )
}
