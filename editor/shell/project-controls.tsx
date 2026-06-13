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
  onOpenFolder?: () => void
}

export function ProjectControls({
  recentProjects,
  onNewProject,
  onOpenRecent,
  onSave,
  onExportBundle,
  onExportPlan,
  onOpenFolder,
}: ProjectControlsProps) {
  const hasRecentProjects = recentProjects !== undefined && recentProjects.length > 0
  return (
    <nav className="editor-shell__project" aria-label="Project">
      {onNewProject ? <ProjectAction label="New" onClick={onNewProject} /> : null}
      {onSave ? <ProjectAction label="Save" onClick={onSave} /> : null}
      {onExportBundle ? <ProjectAction label="Export bundle" onClick={onExportBundle} /> : null}
      {onExportPlan ? <ProjectAction label="Export plan" onClick={onExportPlan} /> : null}
      {onOpenFolder ? <ProjectAction label="Open folder" onClick={onOpenFolder} /> : null}
      {hasRecentProjects && onOpenRecent ? (
        <RecentProjectsList projects={recentProjects} onOpenRecent={onOpenRecent} />
      ) : null}
    </nav>
  )
}

interface ProjectActionProps {
  label: string
  onClick: () => void
}

function ProjectAction({ label, onClick }: ProjectActionProps) {
  return (
    <button type="button" onClick={onClick}>
      {label}
    </button>
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

export function RecoveryPrompt({ onRestore, onDiscard }: RecoveryPromptProps) {
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
