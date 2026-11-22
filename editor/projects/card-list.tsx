import { useRef, useState, type ReactElement, type RefObject } from 'react'
import type { ProjectCardAction, ProjectCardModel } from '../../session'
import { NO_PROJECTS } from './card-text'
import { DeleteProjectDialog } from './delete-project-dialog'
import { ProjectCard, type CardRename } from './project-card'

/** The actions that a card offers. A menu entry shows only when its handler is given. */
export interface ProjectCardActions {
  /** Resolves true when the name is stored, so the form closes. False keeps the form open. */
  readonly onRename?: (id: string, name: string) => Promise<boolean>
  readonly onExport?: (id: string) => void
  readonly onChooseFile?: (id: string) => void
  /** Called once the dialog of a delete is confirmed. The dialog shows before it. */
  readonly onDelete?: (id: string) => void
  readonly onRemoveFromList?: (id: string) => void
}

export interface CardListProps {
  readonly cards: readonly ProjectCardModel[]
  readonly hrefFor: (id: string) => string
  readonly onOpen?: ((id: string) => void) | undefined
  readonly cardActions?: ProjectCardActions | undefined
  /** The page's main region, which takes the focus when a confirmed delete removes the card. */
  readonly page: RefObject<HTMLElement | null>
}

/** The handler of an action, or undefined when the page was given none. */
function handlerOf(action: ProjectCardAction, cardActions: ProjectCardActions | undefined) {
  const handlers = cardActions ?? {}
  switch (action) {
    case 'rename':
      return handlers.onRename
    case 'export':
      return handlers.onExport
    case 'choose-file':
      return handlers.onChooseFile
    case 'delete':
      return handlers.onDelete
    case 'remove-from-list':
      return handlers.onRemoveFromList
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
  const handlers = cardActions ?? {}
  return (id, action) => {
    switch (action) {
      case 'rename':
        starts.rename(id)
        break
      case 'export':
        handlers.onExport?.(id)
        break
      case 'choose-file':
        handlers.onChooseFile?.(id)
        break
      case 'delete':
        starts.delete(id)
        break
      case 'remove-from-list':
        handlers.onRemoveFromList?.(id)
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

export function CardList(props: CardListProps): ReactElement {
  const { cards, hrefFor, onOpen, cardActions, page } = props
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
