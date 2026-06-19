import { useState } from 'react'
import { Button, IconButton } from '../design-system'
import './project-menu.css'

interface RecentProject {
  id: string
  name: string
}

export interface ProjectMenuProps {
  onNewProject?: (() => void) | undefined
  onOpenFile?: (() => void) | undefined
  onOpenFolder?: (() => void) | undefined
  onOpenRecent?: ((id: string) => void) | undefined
  recentProjects?: RecentProject[] | undefined
}

interface MenuItem {
  label: string
  onSelect: () => void
}

// Build the menu entries from the wired handlers, in display order.
function projectMenuItems({
  onNewProject,
  onOpenFile,
  onOpenFolder,
  onOpenRecent,
  recentProjects,
}: ProjectMenuProps): MenuItem[] {
  const items: MenuItem[] = []
  if (onNewProject) {
    items.push({ label: 'New project', onSelect: onNewProject })
  }
  if (onOpenFile) {
    items.push({ label: 'Open file', onSelect: onOpenFile })
  }
  if (onOpenFolder) {
    items.push({ label: 'Open folder', onSelect: onOpenFolder })
  }
  if (onOpenRecent && recentProjects) {
    for (const project of recentProjects) {
      items.push({ label: project.name, onSelect: () => onOpenRecent(project.id) })
    }
  }
  return items
}

// The project menu anchored near the wordmark. It collapses New, Open folder, and the
// recent projects into one dropdown, rendering only the entries whose handler is wired
// and nothing at all when none are.
export function ProjectMenu(props: ProjectMenuProps) {
  const [open, setOpen] = useState(false)
  const items = projectMenuItems(props)
  if (items.length === 0) {
    return null
  }
  return (
    <div className="project-menu">
      <IconButton
        className="project-menu__trigger-shape"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Project menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">▾</span>
      </IconButton>
      {open ? (
        <ul className="project-menu__list" role="menu">
          {items.map((item) => (
            <li key={item.label} role="none">
              <Button
                role="menuitem"
                className="project-menu__row"
                onClick={() => {
                  item.onSelect()
                  setOpen(false)
                }}
              >
                {item.label}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
