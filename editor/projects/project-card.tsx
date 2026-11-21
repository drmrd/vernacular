import { useEffect, useId, useRef, type MouseEvent, type ReactElement, type RefObject } from 'react'
import type { ProjectCardAction, ProjectCardModel } from '../../session'
import {
  DID_NOT_OPEN,
  changedText,
  floorsText,
  locationText,
  previewSource,
  stateLineText,
} from './card-text'
import { CardRenameForm } from './card-rename-form'
import { ProjectCardMenu } from './project-card-menu'

/** The rename form that a card shows under its link. */
export interface CardRename {
  /** Resolves true when the name is stored. */
  readonly onSave: (name: string) => Promise<boolean>
  /** Called when the form closes, after a stored name or a cancel. */
  readonly onClose: () => void
}

interface ProjectCardProps {
  readonly card: ProjectCardModel
  readonly href: string
  /** A plain click. Without it the link alone acts. */
  readonly onOpen?: (id: string) => void
  /** Without it the card shows no "..." control. */
  readonly onAction?: (id: string, action: ProjectCardAction) => void
  /** When set, the card shows the rename form under its link. */
  readonly rename?: CardRename
}

interface DescribedText {
  readonly id: string
  readonly text: string
}

const PRIMARY_BUTTON = 0

function isPlainClick(event: MouseEvent): boolean {
  const modified = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
  return event.button === PRIMARY_BUTTON && !modified
}

function factsOf(card: ProjectCardModel, idBase: string): DescribedText[] {
  const facts = [
    { id: `${idBase}-changed`, text: changedText(card.lastChangedAt) },
    { id: `${idBase}-floors`, text: floorsText(card.floorCount) },
    { id: `${idBase}-location`, text: locationText(card.location) },
  ]
  return facts.flatMap(({ id, text }) => (text === undefined ? [] : [{ id, text }]))
}

function linesOf(card: ProjectCardModel, idBase: string): DescribedText[] {
  return card.stateLines.map((line) => ({
    id: `${idBase}-line-${line}`,
    text: stateLineText(line),
  }))
}

function sentenceOf(card: ProjectCardModel, idBase: string): DescribedText[] {
  return card.preview === 'did-not-open' ? [{ id: `${idBase}-sentence`, text: DID_NOT_OPEN }] : []
}

interface CardPreviewProps {
  readonly preview: ProjectCardModel['preview']
  readonly sentence: readonly DescribedText[]
}

function CardPreview({ preview, sentence }: CardPreviewProps): ReactElement {
  return (
    <span className="project-card__preview">
      {sentence.map(({ id, text }) => (
        <span key={id} id={id} className="project-card__sentence">
          {text}
        </span>
      ))}
      {typeof preview === 'object' ? (
        <img className="project-card__drawing" src={previewSource(preview.svg)} alt="" />
      ) : null}
    </span>
  )
}

interface CardLinkProps {
  readonly card: ProjectCardModel
  readonly href: string
  readonly onOpen?: ProjectCardProps['onOpen'] | undefined
}

function CardLink({ card, href, onOpen }: CardLinkProps): ReactElement {
  const idBase = useId()
  const nameId = `${idBase}-name`
  const facts = factsOf(card, idBase)
  const sentence = sentenceOf(card, idBase)
  const lines = linesOf(card, idBase)
  const described = [...facts, ...sentence, ...lines]
  const open = (event: MouseEvent): void => {
    if (onOpen === undefined || !isPlainClick(event)) {
      return
    }
    event.preventDefault()
    onOpen(card.id)
  }
  return (
    <a
      className="project-card__link"
      href={href}
      aria-labelledby={nameId}
      aria-describedby={described.map(({ id }) => id).join(' ')}
      onClick={open}
    >
      <CardPreview preview={card.preview} sentence={sentence} />
      <span id={nameId} className="project-card__name">
        {card.name}
      </span>
      {facts.map(({ id, text }) => (
        <span key={id} id={id} className="project-card__fact">
          {text}
        </span>
      ))}
      {lines.map(({ id, text }) => (
        <span key={id} id={id} className="project-card__state-line">
          {text}
        </span>
      ))}
    </a>
  )
}

/** The public props, as a parent that forwards handlers it may not have passes them. */
interface ProjectCardInput extends Pick<ProjectCardProps, 'card' | 'href'> {
  readonly onOpen?: ProjectCardProps['onOpen'] | undefined
  readonly onAction?: ProjectCardProps['onAction'] | undefined
  readonly rename?: ProjectCardProps['rename'] | undefined
}

interface RenameOnCardProps {
  readonly name: string
  readonly rename: CardRename
  readonly cardRef: RefObject<HTMLElement | null>
}

/**
 * The rename form of a card. When it closes, the focus goes to the card's "..." control, unless
 * the form is already gone because another card took the rename.
 */
function RenameOnCard({ name, rename, cardRef }: RenameOnCardProps): ReactElement {
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const close = (): void => {
    if (mounted.current) {
      cardRef.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus()
    }
    rename.onClose()
  }
  const save = async (typed: string): Promise<boolean> => {
    const stored = await rename.onSave(typed)
    if (stored) {
      close()
    }
    return stored
  }
  return <CardRenameForm name={name} onSave={save} onCancel={close} />
}

export function ProjectCard({
  card,
  href,
  onOpen,
  onAction,
  rename,
}: ProjectCardInput): ReactElement {
  const cardRef = useRef<HTMLLIElement>(null)
  return (
    <li className="project-card" ref={cardRef}>
      <CardLink card={card} href={href} onOpen={onOpen} />
      {rename ? <RenameOnCard name={card.name} rename={rename} cardRef={cardRef} /> : null}
      {onAction ? (
        <ProjectCardMenu
          projectName={card.name}
          actions={card.actions}
          onAction={(action) => onAction(card.id, action)}
        />
      ) : null}
    </li>
  )
}
