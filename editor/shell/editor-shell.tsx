import { SceneCanvas, useSceneGraph, useSelectionIds, type AutosaveStatus } from '../../bridge'
import { PlanView } from '../plan/plan-view'
import { ToolsPanel } from '../tools/tools-panel'
import './editor-shell.css'

const SAVE_STATUS_LABELS: Record<AutosaveStatus, string> = {
  idle: 'Ready',
  pending: 'Saving...',
  saved: 'All changes saved',
  error: 'Save failed',
}

export interface EditorShellProps {
  saveStatus: AutosaveStatus
}

export function EditorShell({ saveStatus }: EditorShellProps) {
  const graph = useSceneGraph()
  const selectedIds = useSelectionIds()
  return (
    <div className="editor-shell">
      <header className="editor-shell__toolbar" role="banner">
        <h1>Vernacular</h1>
        <p aria-live="polite">Walls: {graph.walls.length}</p>
        <p role="status">{SAVE_STATUS_LABELS[saveStatus]}</p>
      </header>
      <nav className="editor-shell__tools" aria-label="Tools">
        <ToolsPanel />
      </nav>
      <main className="editor-shell__viewport" aria-label="Viewport">
        <PlanView />
        <section className="editor-shell__preview" aria-label="3D preview">
          <SceneCanvas />
        </section>
      </main>
      <aside className="editor-shell__inspector" aria-label="Inspector">
        <p>{selectedIds.size > 0 ? 'Wall selected' : 'No selection'}</p>
      </aside>
    </div>
  )
}
