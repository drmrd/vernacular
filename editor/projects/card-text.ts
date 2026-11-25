import type { ProjectCardAction, ProjectCardLocation, ProjectCardStateLine } from '../../session'

export const NO_PROJECTS = 'There are no saved projects yet.'
export const DID_NOT_OPEN = 'This project did not open.'

const CHANGED_FORMAT: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }

/** A time in the card's format, or undefined when it is absent or cannot be read. */
export function timeText(isoTime: string | undefined): string | undefined {
  if (isoTime === undefined) {
    return undefined
  }
  const time = new Date(isoTime)
  if (Number.isNaN(time.getTime())) {
    return undefined
  }
  return new Intl.DateTimeFormat(undefined, CHANGED_FORMAT).format(time)
}

export function changedText(lastChangedAt: string | undefined): string | undefined {
  const time = timeText(lastChangedAt)
  return time === undefined ? undefined : `Changed ${time}`
}

export function floorsText(floorCount: number | undefined): string | undefined {
  if (floorCount === undefined) {
    return undefined
  }
  return floorCount === 1 ? '1 floor' : `${floorCount} floors`
}

export function locationText(location: ProjectCardLocation): string {
  if (location === 'browser') {
    return 'In this browser.'
  }
  if (location === 'tab') {
    return 'In this tab only.'
  }
  return `Folder: ${location.folderName}`
}

export function stateLineText(line: ProjectCardStateLine): string {
  switch (line) {
    case 'open-here':
      return 'Already open in this tab.'
    case 'open-elsewhere':
      return 'Already open in another tab.'
    case 'needs-permission':
      return 'This folder needs permission again.'
    case 'second-file':
      return 'This project has a second plan file.'
  }
}

export function actionLabel(action: ProjectCardAction): string {
  switch (action) {
    case 'rename':
      return 'Rename'
    case 'export':
      return 'Export'
    case 'choose-file':
      return 'Choose a plan file'
    case 'delete':
      return 'Delete'
    case 'remove-from-list':
      return 'Remove from list'
  }
}

export function backText(name: string): string {
  return `Back to ${name}`
}

export function previewSource(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
