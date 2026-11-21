import { useId, useRef, type DragEvent, type ReactElement } from 'react'
import { Button } from '../design-system'
import type { ProjectCardModel } from '../../session'
import { backText } from './card-text'
import { CardList, type ProjectCardActions } from './card-list'
import './projects-page.css'

export type { ProjectCardActions } from './card-list'

export interface OpenProjectLink {
  readonly name: string
  readonly onBack: () => void
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

function PageHead({
  headingId,
  notice,
  openProject,
}: {
  readonly headingId: string
  readonly notice: string | undefined
  readonly openProject: OpenProjectLink | undefined
}): ReactElement {
  return (
    <>
      <h1 id={headingId} className="projects-page__heading">
        Projects
      </h1>
      {notice ? <PageNotice text={notice} /> : null}
      {openProject ? (
        <Button onClick={openProject.onBack}>{backText(openProject.name)}</Button>
      ) : null}
    </>
  )
}

function PageNotice({ text }: { readonly text: string }): ReactElement {
  return (
    <p role="alert" className="projects-page__notice">
      {text}
    </p>
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
  const page = useRef<HTMLElement>(null)
  return (
    <main
      ref={page}
      className="projects-page"
      aria-labelledby={headingId}
      tabIndex={-1}
      {...dropHandlers(onDropFile)}
    >
      <PageHead headingId={headingId} notice={notice} openProject={openProject} />
      <PageActions
        onNewProject={onNewProject}
        onImportFile={onImportFile}
        onOpenFolder={onOpenFolder}
      />
      {cards ? (
        <CardList
          cards={cards}
          hrefFor={hrefFor}
          onOpen={onOpen}
          cardActions={cardActions}
          page={page}
        />
      ) : null}
    </main>
  )
}
