import { SceneCanvas } from '../../bridge'

export function EditorShell() {
  return (
    <div className="editor-shell">
      <header className="editor-shell__toolbar" role="banner">
        <h1>Vernacular</h1>
      </header>
      <nav className="editor-shell__tools" aria-label="Tools">
        <p>No tools yet.</p>
      </nav>
      <main className="editor-shell__viewport" aria-label="Viewport">
        <SceneCanvas />
      </main>
      <aside className="editor-shell__inspector" aria-label="Inspector">
        <p>No selection.</p>
      </aside>
    </div>
  )
}
