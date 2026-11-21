import type { ProjectCardModel, ProjectCardStateLine, SwitchFailure } from '../session'
import { fixedFailureReason, openFailureReason } from './open-failure-text'
import type { PageNotice } from './resolve-place'

/**
 * Why the project did not open, in one sentence. A failure with a fixed text shows it alone; every
 * other failure names its reason after a fixed opening.
 */
export function failureText(failure: SwitchFailure): string {
  const fixed = fixedFailureReason(failure)
  if (fixed !== undefined && fixed !== '') {
    return fixed
  }
  return `Could not open the project: ${openFailureReason(failure)}`
}

/** The line of a card that already says what the failure says, if any. */
function lineSayingSo(failure: SwitchFailure): ProjectCardStateLine | undefined {
  switch (failure.kind) {
    case 'open-elsewhere':
      return 'open-elsewhere'
    case 'folder-permission':
      return 'needs-permission'
    default:
      return undefined
  }
}

/** The sentence of the page's notice, or undefined when a card line says it already. */
export function pageNoticeText(
  notice: PageNotice | undefined,
  cards: readonly ProjectCardModel[] | undefined,
): string | undefined {
  if (notice === undefined) {
    return undefined
  }
  const line = lineSayingSo(notice.failure)
  const card = cards?.find((candidate) => candidate.id === notice.id)
  if (line !== undefined && card?.stateLines.includes(line) === true) {
    return undefined
  }
  return failureText(notice.failure)
}
