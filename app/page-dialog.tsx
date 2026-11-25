import type { ReactElement } from 'react'
import {
  FailedOpenDialog,
  RepairChoiceDialog,
  TwoFilesDialog,
  type TwoFilesDialogProps,
} from '../editor/projects'
import type { FailedOpenDialogState, ShownFailure } from './use-failed-open-dialog'

interface PageDialogProps {
  readonly failedOpen: FailedOpenDialogState
  /** The choice between two plan files. It shows when no failed-open dialog does. */
  readonly twoFiles: TwoFilesDialogProps | undefined
  /** The open of a card, which "Try again" runs. */
  readonly onOpen: (id: string) => void
  /** The export of a card. Absent: no Export control. */
  readonly onExport: ((id: string) => void) | undefined
}

/** Export and "Try again" of a stored project run the card's own. A file has neither. */
function storedControls(
  shown: ShownFailure,
  { onOpen, onExport }: Pick<PageDialogProps, 'onOpen' | 'onExport'>,
) {
  if (shown.source === 'file') {
    return { onExport: undefined, onTryAgain: undefined }
  }
  const { id } = shown
  return {
    onExport: onExport === undefined ? undefined : () => onExport(id),
    onTryAgain: () => onOpen(id),
  }
}

/**
 * The failed-open dialog of the page, or its choice dialog while the user chooses. With no failed
 * open, the choice between two plan files. One dialog shows at a time.
 */
export function PageDialog({
  failedOpen,
  twoFiles,
  onOpen,
  onExport,
}: PageDialogProps): ReactElement | null {
  const { shown, choice, onClose } = failedOpen
  if (shown === undefined) {
    return twoFiles === undefined ? null : <TwoFilesDialog {...twoFiles} />
  }
  const { model } = shown
  if (choice.choosing && model.repair !== undefined) {
    return (
      <RepairChoiceDialog
        onOpenAsNew={choice.openAsNew}
        onCancel={choice.cancel}
        busy={choice.busy}
        onReplace={shown.source === 'stored' ? choice.replace : undefined}
      />
    )
  }
  return (
    <FailedOpenDialog
      cause={model.cause}
      details={model.details}
      source={shown.source}
      repairSentences={model.repair?.sentences ?? []}
      onClose={onClose}
      {...storedControls(shown, { onOpen, onExport })}
      onOpenWithRepair={choice.start}
    />
  )
}
