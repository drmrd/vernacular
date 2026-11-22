import { useId, type KeyboardEvent, type ReactElement } from 'react'
import { Button, useFocusTrap } from '../design-system'
import { causeSentence, type FailedOpenCause } from './failure-sentences'
import './failed-open-dialog.css'

export type { FailedOpenCause } from './failure-sentences'

export interface FailedOpenDetails {
  /** The technical sentence of the failure. */
  readonly error: string
  /** Each fault of the document, with its JSON pointer. Empty when the failure names none. */
  readonly faults: readonly { readonly path: string; readonly message: string }[]
  /** The format version of the stored document. Absent when it could not be read. */
  readonly formatVersion?: number
  /** The build of the app that tried to open the project. */
  readonly build: string
  /** The JSON pointers that the offered repair removes. Empty with no offer. */
  readonly removedPaths: readonly string[]
}

export interface FailedOpenDialogProps {
  readonly cause: FailedOpenCause
  readonly details: FailedOpenDetails
  /** The sentences of the offered repair. Absent or empty: no offer shows. */
  readonly repairSentences?: readonly string[] | undefined
  readonly onClose: () => void
  /** Absent: no Export control. */
  readonly onExport?: (() => void) | undefined
  /** "Try again" shows only for `storage-unavailable` and `folder-unavailable`, and only when given. */
  readonly onTryAgain?: (() => void) | undefined
  /** Called for "Open with the repair". It shows only with an offer. */
  readonly onOpenWithRepair?: (() => void) | undefined
}

const TITLE = 'This project did not open.'
const KEPT_UNCHANGED = 'The stored file is kept unchanged.'
const EXPORT_HINT = 'You can export a copy from the Projects page.'
const REPAIR_OPENING = 'A repair can open this project.'
const RETRY_CAUSES: readonly FailedOpenCause[] = ['storage-unavailable', 'folder-unavailable']

/** Escape answers the safe way and stops here, so it reaches nothing behind the dialog. */
function closeOnEscape(onClose: () => void): (event: KeyboardEvent<HTMLElement>) => void {
  return (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
  }
}

function TechnicalEntry({
  label,
  values,
}: {
  readonly label: string
  readonly values: readonly string[]
}): ReactElement {
  return (
    <>
      <dt className="failed-open-dialog__technical-label">{label}</dt>
      {values.map((value, index) => (
        <dd key={`${index}:${value}`} className="failed-open-dialog__technical-value">
          {value}
        </dd>
      ))}
    </>
  )
}

function TechnicalDetails({ details }: { readonly details: FailedOpenDetails }): ReactElement {
  const { error, faults, formatVersion, build, removedPaths } = details
  return (
    <details>
      <summary>Technical details</summary>
      <dl>
        <TechnicalEntry label="Error" values={[error]} />
        {faults.length > 0 && (
          <TechnicalEntry
            label="Paths in the document"
            values={faults.map((fault) => `${fault.path}: ${fault.message}`)}
          />
        )}
        {formatVersion !== undefined && (
          <TechnicalEntry label="Format version" values={[String(formatVersion)]} />
        )}
        <TechnicalEntry label="Build" values={[build]} />
        {removedPaths.length > 0 && (
          <TechnicalEntry label="Paths that the repair removes" values={removedPaths} />
        )}
      </dl>
    </details>
  )
}

function RepairOffer({ sentences }: { readonly sentences: readonly string[] }): ReactElement {
  return (
    <>
      <p className="failed-open-dialog__sentence">{REPAIR_OPENING}</p>
      <ul className="failed-open-dialog__repair-list">
        {sentences.map((sentence) => (
          <li key={sentence}>{sentence}</li>
        ))}
      </ul>
    </>
  )
}

interface DescribedSentence {
  readonly id: string
  readonly text: string
}

/** The sentences that describe the dialog, each with the id that `aria-describedby` names. */
function describedSentences(cause: FailedOpenCause, idBase: string): readonly DescribedSentence[] {
  return [
    { id: `${idBase}-cause`, text: causeSentence(cause) },
    { id: `${idBase}-kept`, text: KEPT_UNCHANGED },
    { id: `${idBase}-export`, text: EXPORT_HINT },
  ]
}

function Sentences({
  sentences,
}: {
  readonly sentences: readonly DescribedSentence[]
}): ReactElement {
  return (
    <>
      {sentences.map(({ id, text }) => (
        <p key={id} id={id} className="failed-open-dialog__sentence">
          {text}
        </p>
      ))}
    </>
  )
}

function Controls({
  cause,
  repairSentences,
  onClose,
  onExport,
  onTryAgain,
  onOpenWithRepair,
}: FailedOpenDialogProps & { readonly repairSentences: readonly string[] }): ReactElement {
  const offersRetry = onTryAgain !== undefined && RETRY_CAUSES.includes(cause)
  const offersRepair = repairSentences.length > 0 && onOpenWithRepair !== undefined
  return (
    <div className="failed-open-dialog__buttons">
      <Button onClick={onClose}>Close</Button>
      {offersRetry && <Button onClick={onTryAgain}>Try again</Button>}
      {onExport && <Button onClick={onExport}>Export</Button>}
      {offersRepair && (
        <Button variant="primary" onClick={onOpenWithRepair}>
          Open with the repair
        </Button>
      )}
    </div>
  )
}

/**
 * The reason a project did not open and the ways out. Mount it only while it shows: the focus
 * trap arms in a mount effect, so a dialog that stayed mounted would not take the focus the
 * second time.
 */
export function FailedOpenDialog(props: FailedOpenDialogProps): ReactElement {
  const { cause, details, repairSentences = [], onClose } = props
  const dialogRef = useFocusTrap<HTMLDivElement>()
  const idBase = useId()
  const titleId = `${idBase}-title`
  const sentences = describedSentences(cause, idBase)
  return (
    // The trap and the Escape handler sit on the shade, which the trap makes focusable.
    <div
      ref={dialogRef}
      className="failed-open-dialog__backdrop"
      onKeyDown={closeOnEscape(onClose)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={sentences.map(({ id }) => id).join(' ')}
        className="failed-open-dialog"
      >
        <h2 id={titleId} className="failed-open-dialog__title">
          {TITLE}
        </h2>
        <Sentences sentences={sentences} />
        {repairSentences.length > 0 && <RepairOffer sentences={repairSentences} />}
        <TechnicalDetails details={details} />
        <Controls {...props} repairSentences={repairSentences} />
      </div>
    </div>
  )
}
