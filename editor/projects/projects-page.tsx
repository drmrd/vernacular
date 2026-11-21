import { useId, type ReactElement } from 'react'
import { Button } from '../design-system'
import type { ProjectCardAction, ProjectCardModel } from '../../session'
import { NO_PROJECTS, backText } from './card-text'
import { ProjectCard } from './project-card'
import './projects-page.css'

export interface OpenProjectLink {
  readonly name: string
  readonly onBack: () => void
}

export interface ProjectsPageProps {
  /** The cards in the order to show. Undefined until the first read ends. */
  readonly cards: readonly ProjectCardModel[] | undefined
  readonly hrefFor: (id: string) => string
  readonly onOpen?: (id: string) => void
  readonly onCardAction?: (id: string, action: ProjectCardAction) => void
  /** The project open in this tab. With it the page shows "Back to <name>". */
  readonly openProject?: OpenProjectLink
  /** One sentence that says why a project did not open. */
  readonly notice?: string
  readonly onNewProject?: () => void
  readonly onImportFile?: () => void
  readonly onOpenFolder?: () => void
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
  readonly onCardAction?: ProjectsPageProps['onCardAction'] | undefined
}

function CardList({ cards, hrefFor, onOpen, onCardAction }: CardListProps): ReactElement {
  if (cards.length === 0) {
    return <p className="projects-page__empty">{NO_PROJECTS}</p>
  }
  return (
    <ul className="projects-page__cards">
      {cards.map((card) => (
        <ProjectCard
          key={card.id}
          card={card}
          href={hrefFor(card.id)}
          onOpen={onOpen}
          onAction={onCardAction}
        />
      ))}
    </ul>
  )
}

export function ProjectsPage({
  cards,
  hrefFor,
  onOpen,
  onCardAction,
  openProject,
  notice,
  onNewProject,
  onImportFile,
  onOpenFolder,
}: ProjectsPageProps): ReactElement {
  const headingId = useId()
  return (
    <main className="projects-page" aria-labelledby={headingId}>
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
        <CardList cards={cards} hrefFor={hrefFor} onOpen={onOpen} onCardAction={onCardAction} />
      ) : null}
    </main>
  )
}
