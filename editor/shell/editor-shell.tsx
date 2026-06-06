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

interface RecentProject {
  id: string
  name: string
}

interface ProjectControlsProps {
  recentProjects?: RecentProject[]
  onNewProject?: () => void
  onOpenRecent?: (id: string) => void
  onSave?: () => void
  onExportBundle?: () => void
}

function ProjectControls({
  recentProjects,
  onNewProject,
  onOpenRecent,
  onSave,
  onExportBundle,
}: ProjectControlsProps) {
  const hasRecentProjects = recentProjects !== undefined && recentProjects.length > 0
  return (
    <nav className="editor-shell__project" aria-label="Project">
      {onNewProject ? (
        <button type="button" onClick={onNewProject}>
          New
        </button>
      ) : null}
      {onSave ? (
        <button type="button" onClick={onSave}>
          Save
        </button>
      ) : null}
      {onExportBundle ? (
        <button type="button" onClick={onExportBundle}>
          Export bundle
        </button>
      ) : null}
      {hasRecentProjects && onOpenRecent ? (
        <RecentProjectsList projects={recentProjects} onOpenRecent={onOpenRecent} />
      ) : null}
    </nav>
  )
}

interface RecentProjectsListProps {
  projects: RecentProject[]
  onOpenRecent: (id: string) => void
}

function RecentProjectsList({ projects, onOpenRecent }: RecentProjectsListProps) {
  return (
    <ul className="editor-shell__recent">
      {projects.map((project) => (
        <li key={project.id}>
          <button type="button" onClick={() => onOpenRecent(project.id)}>
            {project.name}
          </button>
        </li>
      ))}
    </ul>
  )
}

interface RecoveryPromptProps {
  onRestore: () => void
  onDiscard: () => void
}

function RecoveryPrompt({ onRestore, onDiscard }: RecoveryPromptProps) {
  return (
    <div className="editor-shell__recovery" role="alert">
      <p>Unsaved changes were recovered.</p>
      <button type="button" onClick={onRestore}>
        Restore
      </button>
      <button type="button" onClick={onDiscard}>
        Discard
      </button>
    </div>
  )
}

export interface EditorShellProps extends ProjectControlsProps {
  saveStatus: AutosaveStatus
  recovery?: { onRestore: () => void; onDiscard: () => void }
}

export function EditorShell({ saveStatus, recovery, ...projectControls }: EditorShellProps) {
  const graph = useSceneGraph()
  const selectedIds = useSelectionIds()
  return (
    <div className="editor-shell">
      <header className="editor-shell__toolbar" role="banner">
        <h1>Vernacular</h1>
        <p aria-live="polite">Walls: {graph.walls.length}</p>
        <p role="status">{SAVE_STATUS_LABELS[saveStatus]}</p>
        <ProjectControls {...projectControls} />
      </header>
      {recovery ? (
        <RecoveryPrompt onRestore={recovery.onRestore} onDiscard={recovery.onDiscard} />
      ) : null}
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
