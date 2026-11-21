import { useId, useRef, useState, type DragEvent, type ReactElement, type RefObject } from 'react'
import { Button } from '../design-system'
import type { ProjectCardAction, ProjectCardModel } from '../../session'
import { NO_PROJECTS, backText } from './card-text'
import { DeleteProjectDialog } from './delete-project-dialog'
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
  readonly onExport?: (id: string) => void
  /** Called once the dialog of a delete is confirmed. The dialog shows before it. */
  readonly onDelete?: (id: string) => void
  readonly onRemoveFromList?: (id: string) => void
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
  /** The page's main region, which takes the focus when a confirmed delete removes the card. */
  readonly page: RefObject<HTMLElement | null>
}

/** The handler of an action, or undefined when the page was given none. */
function handlerOf(action: ProjectCardAction, cardActions: ProjectCardActions | undefined) {
  switch (action) {
    case 'rename':
      return cardActions?.onRename
    case 'export':
      return cardActions?.onExport
    case 'delete':
      return cardActions?.onDelete
    case 'remove-from-list':
      return cardActions?.onRemoveFromList
  }
}

/** The actions of the card that have a handler, in the card's order. */
function offeredActions(
  card: ProjectCardModel,
  cardActions: ProjectCardActions | undefined,
): readonly ProjectCardAction[] {
  return card.actions.filter((action) => handlerOf(action, cardActions) !== undefined)
}

/** What a chosen action starts when it needs more than a call: a form or a dialog. */
interface ActionStarts {
  readonly rename: (id: string) => void
  readonly delete: (id: string) => void
}

/** The runner of a chosen action: rename and delete open their form or dialog, the rest call. */
function actionRunner(
  cardActions: ProjectCardActions | undefined,
  starts: ActionStarts,
): (id: string, action: ProjectCardAction) => void {
  return (id, action) => {
    switch (action) {
      case 'rename':
        starts.rename(id)
        break
      case 'export':
        cardActions?.onExport?.(id)
        break
      case 'delete':
        starts.delete(id)
        break
      case 'remove-from-list':
        cardActions?.onRemoveFromList?.(id)
        break
    }
  }
}

/** The card's "..." control, found by the card's place in the list. */
function focusMenuOfCard(list: RefObject<HTMLUListElement | null>, index: number): void {
  list.current?.children[index]?.querySelector<HTMLElement>('[aria-haspopup]')?.focus()
}

/** The elements that take the focus when the dialog of a delete closes. */
interface DialogFocusTargets {
  readonly list: RefObject<HTMLUListElement | null>
  readonly page: RefObject<HTMLElement | null>
}

/**
 * The dialog of a delete. A card that leaves the list takes its dialog with it. Cancel returns the
 * focus to the card's "..." control; a confirmed delete moves it to the page's main region, since
 * the card is about to go.
 */
function useDeleteDialog(
  cards: readonly ProjectCardModel[],
  onDelete: ProjectCardActions['onDelete'],
  elements: DialogFocusTargets,
) {
  const { list, page } = elements
  const [deletingId, setDeletingId] = useState<string | null>(null)
  if (deletingId !== null && !cards.some(({ id }) => id === deletingId)) {
    setDeletingId(null)
  }
  const index = cards.findIndex(({ id }) => id === deletingId)
  const card = cards[index]
  const dialog =
    card && onDelete ? (
      <DeleteProjectDialog
        name={card.name}
        onCancel={() => {
          focusMenuOfCard(list, index)
          setDeletingId(null)
        }}
        onConfirm={() => {
          page.current?.focus()
          setDeletingId(null)
          onDelete(card.id)
        }}
      />
    ) : null
  return { dialog, startDelete: setDeletingId }
}

function CardList({ cards, hrefFor, onOpen, cardActions, page }: CardListProps): ReactElement {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const list = useRef<HTMLUListElement>(null)
  const { dialog, startDelete } = useDeleteDialog(cards, cardActions?.onDelete, { list, page })
  // A card that left the list takes its form with it, also when it comes back.
  if (renamingId !== null && !cards.some(({ id }) => id === renamingId)) {
    setRenamingId(null)
  }
  if (cards.length === 0) {
    return <p className="projects-page__empty">{NO_PROJECTS}</p>
  }
  const chooseAction = actionRunner(cardActions, { rename: setRenamingId, delete: startDelete })
  const renameOf = (id: string): CardRename | undefined =>
    renamingId === id && cardActions?.onRename
      ? {
          onSave: (name) => cardActions.onRename?.(id, name) ?? Promise.resolve(false),
          onClose: () => setRenamingId((shown) => (shown === id ? null : shown)),
        }
      : undefined
  return (
    <>
      <ul className="projects-page__cards" ref={list}>
        {cards.map((card) => {
          const actions = offeredActions(card, cardActions)
          return (
            <ProjectCard
              key={card.id}
              card={{ ...card, actions }}
              href={hrefFor(card.id)}
              onOpen={onOpen}
              onAction={actions.length === 0 ? undefined : chooseAction}
              rename={renameOf(card.id)}
            />
          )
        })}
      </ul>
      {dialog}
    </>
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
