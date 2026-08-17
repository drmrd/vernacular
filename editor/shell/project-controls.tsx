import { Button } from '../design-system'

interface RecentProject {
  id: string
  name: string
}

export interface ProjectControlsProps {
  recentProjects?: RecentProject[]
  onNewProject?: () => void
  onOpenRecent?: (id: string) => void
  onSave?: () => void
  onExportBundle?: () => void
  onExportPlan?: () => void
  onExportImage?: () => void
  onExportPdf?: () => void
  onOpenFolder?: () => void
  onOpenFile?: () => void
  onImportDroppedFile?: ((file: File) => void) | undefined
}

// The editor header no longer surfaces a manual Save button: autosave is the canonical
// persistence path since the write-ahead recovery work. This component and its onSave action
// are kept for the component catalogue and as a programmatic save entry point, not rendered in the shell.
export function ProjectControls({
  recentProjects,
  onNewProject,
  onOpenRecent,
  onSave,
  onOpenFolder,
}: ProjectControlsProps) {
  const hasRecentProjects = recentProjects !== undefined && recentProjects.length > 0
  return (
    <nav className="editor-shell__project" aria-label="Project">
      <ProjectAction label="New" onClick={onNewProject} />
      <ProjectAction label="Save" onClick={onSave} />
      <ProjectAction label="Open folder" onClick={onOpenFolder} />
      {hasRecentProjects && onOpenRecent ? (
        <RecentProjectsList projects={recentProjects} onOpenRecent={onOpenRecent} />
      ) : null}
    </nav>
  )
}

interface ProjectActionProps {
  label: string
  onClick: (() => void) | undefined
}

function ProjectAction({ label, onClick }: ProjectActionProps) {
  if (!onClick) {
    return null
  }
  return <Button onClick={onClick}>{label}</Button>
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

// Both answers here are consequential and neither used to say so: Restore drops the
// document currently open in favour of the recovered one, and the destructive answer
// deletes the recovered copy rather than the changes on screen, which a bare
// "Discard" beside a recovery notice reads as exactly backwards.
export function RecoveryPrompt({ onRestore, onDiscard }: RecoveryPromptProps) {
  return (
    <div className="editor-shell__recovery" role="alert">
      <p>Unsaved changes were recovered. Restore replaces the document you have open.</p>
      <Button onClick={onRestore}>Restore</Button>
      <Button onClick={onDiscard}>Delete recovered copy</Button>
    </div>
  )
}
