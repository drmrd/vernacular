import type { ReactElement } from 'react'
import { Button, IconButton, useMenuButton } from '../design-system'
import type { ProjectCardAction } from '../../session'
import { actionLabel } from './card-text'

export interface ProjectCardMenuProps {
  /** The project name, for the accessible name of the control. */
  readonly projectName: string
  readonly actions: readonly ProjectCardAction[]
  readonly onAction: (action: ProjectCardAction) => void
}

// The "..." control of a card. It renders nothing when the card has no action to offer.
export function ProjectCardMenu({
  projectName,
  actions,
  onAction,
}: ProjectCardMenuProps): ReactElement | null {
  const menu = useMenuButton<HTMLDivElement>()
  if (actions.length === 0) {
    return null
  }
  return (
    <div className="project-card-menu" ref={menu.containerRef}>
      <IconButton aria-label={`Actions for ${projectName}`} {...menu.triggerProps}>
        <span aria-hidden="true">...</span>
      </IconButton>
      {menu.open ? (
        <ul className="project-card-menu__list" {...menu.menuProps}>
          {actions.map((action) => (
            <li key={action} role="none">
              <Button
                role="menuitem"
                className="project-card-menu__row"
                onClick={() => {
                  onAction(action)
                  menu.close()
                }}
              >
                {actionLabel(action)}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
