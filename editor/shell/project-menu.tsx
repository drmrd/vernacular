import { useState, type FormEvent, type ReactElement } from 'react'
import { Button, Field, IconButton, useMenuButton, type MenuButton } from '../design-system'
import './project-menu.css'

interface RecentProject {
  id: string
  name: string
}

export interface ProjectMenuProps {
  onNewProject?: (() => void) | undefined
  onSave?: (() => void) | undefined
  onOpenFile?: (() => void) | undefined
  onOpenFolder?: (() => void) | undefined
  onOpenRecent?: ((id: string) => void) | undefined
  recentProjects?: RecentProject[] | undefined
  /** The current project name, seeded into the inline rename form. */
  projectName?: string | undefined
  /** Renames the project; absent hides the inline rename affordance. */
  onRename?: ((name: string) => void) | undefined
}

interface MenuItem {
  label: string
  onSelect: () => void
}

interface ProjectMenuItemsInput extends ProjectMenuProps {
  onStartRename: (() => void) | undefined
}

// Build the menu entries from the wired handlers, in display order.
function projectMenuItems({
  onNewProject,
  onSave,
  onOpenFile,
  onOpenFolder,
  onOpenRecent,
  recentProjects,
  onStartRename,
}: ProjectMenuItemsInput): MenuItem[] {
  const items: MenuItem[] = []
  if (onNewProject) {
    items.push({ label: 'New project', onSelect: onNewProject })
  }
  if (onSave) {
    items.push({ label: 'Save', onSelect: onSave })
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
  if (onStartRename) {
    items.push({ label: 'Rename', onSelect: onStartRename })
  }
  return items
}

const PROJECT_NAME_INPUT_ID = 'project-menu-rename-name'

interface ProjectRenameFormProps {
  initialName: string
  onCommit: (name: string) => void
  onCancel: () => void
}

// Inline editor for the project name, swapped in for the menu list. Enter (form
// submit) commits the draft; Escape abandons it and restores the menu.
function ProjectRenameForm({
  initialName,
  onCommit,
  onCancel,
}: ProjectRenameFormProps): ReactElement {
  const [draft, setDraft] = useState(initialName)
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    onCommit(draft)
  }
  return (
    <form className="project-menu__rename" onSubmit={submit}>
      <Field htmlFor={PROJECT_NAME_INPUT_ID} label="Project name">
        <input
          id={PROJECT_NAME_INPUT_ID}
          className="project-menu__rename-input"
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onCancel()
            }
          }}
        />
      </Field>
      <Button type="submit">Save name</Button>
    </form>
  )
}

interface ProjectMenuListProps {
  items: MenuItem[]
  menu: MenuButton<HTMLDivElement>
}

// The open menu list: each entry runs its handler, then closes the menu.
function ProjectMenuList({ items, menu }: ProjectMenuListProps): ReactElement {
  return (
    <ul className="project-menu__list" {...menu.menuProps}>
      {items.map((item) => (
        <li key={item.label} role="none">
          <Button
            role="menuitem"
            className="project-menu__row"
            onClick={() => {
              item.onSelect()
              menu.close()
            }}
          >
            {item.label}
          </Button>
        </li>
      ))}
    </ul>
  )
}

interface ProjectMenuContentInput {
  renaming: boolean
  menu: MenuButton<HTMLDivElement>
  items: MenuItem[]
  renameForm: ReactElement
}

function projectMenuContent({
  renaming,
  menu,
  items,
  renameForm,
}: ProjectMenuContentInput): ReactElement | null {
  if (renaming) {
    return renameForm
  }
  if (menu.open) {
    return <ProjectMenuList items={items} menu={menu} />
  }
  return null
}

// The project menu anchored near the wordmark. It collapses New, Open folder, and the
// recent projects into one dropdown, rendering only the entries whose handler is wired
// and nothing at all when none are.
export function ProjectMenu(props: ProjectMenuProps) {
  const menu = useMenuButton<HTMLDivElement>()
  const [renaming, setRenaming] = useState(false)
  const { projectName, onRename } = props
  const items = projectMenuItems({
    ...props,
    onStartRename: onRename ? () => setRenaming(true) : undefined,
  })
  if (items.length === 0) {
    return null
  }
  const commitRename = (name: string): void => {
    onRename?.(name)
    setRenaming(false)
  }
  const renameForm = (
    <ProjectRenameForm
      initialName={projectName ?? ''}
      onCommit={commitRename}
      onCancel={() => setRenaming(false)}
    />
  )
  return (
    <div className="project-menu" ref={menu.containerRef}>
      <IconButton labeled className="project-menu__trigger-shape" {...menu.triggerProps}>
        <span>Project</span>
        <span aria-hidden="true">▾</span>
      </IconButton>
      {projectMenuContent({ renaming, menu, items, renameForm })}
    </div>
  )
}
