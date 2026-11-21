import { useId, type MouseEvent, type ReactElement } from 'react'
import type { ProjectCardAction, ProjectCardModel } from '../../session'
import {
  DID_NOT_OPEN,
  changedText,
  floorsText,
  locationText,
  previewSource,
  stateLineText,
} from './card-text'
import { ProjectCardMenu } from './project-card-menu'

interface ProjectCardProps {
  readonly card: ProjectCardModel
  readonly href: string
  /** A plain click. Without it the link alone acts. */
  readonly onOpen?: (id: string) => void
  /** Without it the card shows no "..." control. */
  readonly onAction?: (id: string, action: ProjectCardAction) => void
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
}

export function ProjectCard({ card, href, onOpen, onAction }: ProjectCardInput): ReactElement {
  return (
    <li className="project-card">
      <CardLink card={card} href={href} onOpen={onOpen} />
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
