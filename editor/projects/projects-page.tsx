import { useId, useState, type DragEvent, type ReactElement } from 'react'
import { Button } from '../design-system'
import type { ProjectCardAction, ProjectCardModel } from '../../session'
import { NO_PROJECTS, backText } from './card-text'
import { ProjectCard, type CardRename } from './project-card'
import './projects-page.css'

export interface OpenProjectLink {
  readonly name: string
  readonly onBack: () => void
}

/** The actions that a card offers. A menu entry shows only when its handler is given. */
export interface ProjectCardActions {
  /** Resolves true when the name is stored, so the form closes. False keeps the form open. */
  readonly onRename?: (id: string, name: string) => Promise<boolean>
}

export interface ProjectsPageProps {
  /** The cards in the order to show. Undefined until the first read ends. */
  readonly cards: readonly ProjectCardModel[] | undefined
  readonly hrefFor: (id: string) => string
  readonly onOpen?: (id: string) => void
  readonly cardActions?: ProjectCardActions
  /** The project open in this tab. With it the page shows "Back to <name>". */
  readonly openProject?: OpenProjectLink
  /** One sentence that says why a project did not open. */
  readonly notice?: string
  readonly onNewProject?: () => void
  readonly onImportFile?: () => void
  readonly onOpenFolder?: () => void
  /** A file dropped on the page. */
  readonly onDropFile?: (file: File) => void
}

interface PageActionHandlers {
  readonly onNewProject?: ProjectsPageProps['onNewProject'] | undefined
  readonly onImportFile?: ProjectsPageProps['onImportFile'] | undefined
  readonly onOpenFolder?: ProjectsPageProps['onOpenFolder'] | undefined
}

function PageActions({
  onNewProject,
  onImportFile,
  onOpenFolder,
}: PageActionHandlers): ReactElement {
  return (
    <div className="projects-page__actions">
      {onNewProject ? (
        <Button variant="primary" onClick={onNewProject}>
          New project
        </Button>
      ) : null}
      {onImportFile ? <Button onClick={onImportFile}>Import file</Button> : null}
      {onOpenFolder ? <Button onClick={onOpenFolder}>Open folder</Button> : null}
    </div>
  )
}

interface CardListProps {
  readonly cards: readonly ProjectCardModel[]
  readonly hrefFor: ProjectsPageProps['hrefFor']
  readonly onOpen?: ProjectsPageProps['onOpen'] | undefined
  readonly cardActions?: ProjectCardActions | undefined
}

/** The actions of the card that have a handler, in the card's order. */
function offeredActions(
  card: ProjectCardModel,
  cardActions: ProjectCardActions | undefined,
): readonly ProjectCardAction[] {
  return card.actions.filter((action) => action === 'rename' && cardActions?.onRename)
}

function CardList({ cards, hrefFor, onOpen, cardActions }: CardListProps): ReactElement {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  // A card that left the list takes its form with it, also when it comes back.
  if (renamingId !== null && !cards.some(({ id }) => id === renamingId)) {
    setRenamingId(null)
  }
  if (cards.length === 0) {
    return <p className="projects-page__empty">{NO_PROJECTS}</p>
  }
  const renameOf = (id: string): CardRename | undefined =>
    renamingId === id && cardActions?.onRename
      ? {
          onSave: (name) => cardActions.onRename?.(id, name) ?? Promise.resolve(false),
          onClose: () => setRenamingId(null),
        }
      : undefined
  return (
    <ul className="projects-page__cards">
      {cards.map((card) => {
        const actions = offeredActions(card, cardActions)
        return (
          <ProjectCard
            key={card.id}
            card={{ ...card, actions }}
            href={hrefFor(card.id)}
            onOpen={onOpen}
            onAction={actions.length === 0 ? undefined : () => setRenamingId(card.id)}
            rename={renameOf(card.id)}
          />
        )
      })}
    </ul>
  )
}

// The drag handlers of the page: with a handler, a dropped file goes to it, the first file only.
function dropHandlers(onDropFile: ProjectsPageProps['onDropFile']) {
  if (onDropFile === undefined) {
    return {}
  }
  return {
    onDragOver: (event: DragEvent<HTMLElement>) => event.preventDefault(),
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault()
      const file = event.dataTransfer?.files?.[0]
      if (file) {
        onDropFile(file)
      }
    },
  }
}

export function ProjectsPage({
  cards,
  hrefFor,
  onOpen,
  cardActions,
  openProject,
  notice,
  onNewProject,
  onImportFile,
  onOpenFolder,
  onDropFile,
}: ProjectsPageProps): ReactElement {
  const headingId = useId()
  return (
    <main className="projects-page" aria-labelledby={headingId} {...dropHandlers(onDropFile)}>
      <h1 id={headingId} className="projects-page__heading">
        Projects
      </h1>
      {notice ? (
        <p role="alert" className="projects-page__notice">
          {notice}
        </p>
      ) : null}
      {openProject ? (
        <Button onClick={openProject.onBack}>{backText(openProject.name)}</Button>
      ) : null}
      <PageActions
        onNewProject={onNewProject}
        onImportFile={onImportFile}
        onOpenFolder={onOpenFolder}
      />
      {cards ? (
        <CardList cards={cards} hrefFor={hrefFor} onOpen={onOpen} cardActions={cardActions} />
      ) : null}
    </main>
  )
}
