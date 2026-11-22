import { describe, it, expect } from 'vitest'
import type { ProjectCardAction, ProjectCardStateLine } from '../../session'
import {
  actionLabel,
  backText,
  changedText,
  floorsText,
  locationText,
  previewSource,
  stateLineText,
} from './card-text'

const CHANGED_AT = '2026-03-04T10:15:00.000Z'
const NO_FLOORS = 0
const ONE_FLOOR = 1
const THREE_FLOORS = 3

describe('changedText', () => {
  it('reads Changed followed by the medium date and short time of the user locale', () => {
    const time = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(CHANGED_AT))
    expect(changedText(CHANGED_AT)).toBe(`Changed ${time}`)
  })

  it('gives nothing when there is no change time', () => {
    expect(changedText(undefined)).toBeUndefined()
  })

  it('gives nothing when the text is no date', () => {
    expect(changedText('last Tuesday, probably')).toBeUndefined()
  })
})

describe('floorsText', () => {
  it('uses the singular for one floor', () => {
    expect(floorsText(ONE_FLOOR)).toBe('1 floor')
  })

  it('uses the plural for several floors', () => {
    expect(floorsText(THREE_FLOORS)).toBe('3 floors')
  })

  it('uses the plural for no floors', () => {
    expect(floorsText(NO_FLOORS)).toBe('0 floors')
  })

  it('gives nothing when the floor count is unknown', () => {
    expect(floorsText(undefined)).toBeUndefined()
  })
})

describe('locationText', () => {
  it('says a project of the durable workspace is in this browser', () => {
    expect(locationText('browser')).toBe('In this browser.')
  })

  it('says a project of the temporary workspace is in this tab only', () => {
    expect(locationText('tab')).toBe('In this tab only.')
  })

  it('names the folder of a folder project', () => {
    expect(locationText({ folderName: 'Old house' })).toBe('Folder: Old house')
  })
})

describe('stateLineText', () => {
  const sentences: [ProjectCardStateLine, string][] = [
    ['open-here', 'Already open in this tab.'],
    ['open-elsewhere', 'Already open in another tab.'],
    ['needs-permission', 'This folder needs permission again.'],
    ['second-file', 'This project has a second plan file.'],
  ]

  it.each(sentences)('says %s as a sentence', (line, sentence) => {
    expect(stateLineText(line)).toBe(sentence)
  })
})

describe('actionLabel', () => {
  const labels: [ProjectCardAction, string][] = [
    ['rename', 'Rename'],
    ['export', 'Export'],
    ['choose-file', 'Choose a plan file'],
    ['delete', 'Delete'],
    ['remove-from-list', 'Remove from list'],
  ]

  it.each(labels)('labels %s for a menu item', (action, label) => {
    expect(actionLabel(action)).toBe(label)
  })
})

describe('backText', () => {
  it('names the project the user goes back to', () => {
    expect(backText('Old house')).toBe('Back to Old house')
  })
})

describe('previewSource', () => {
  const drawing = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>'

  it('makes a data address of an SVG image', () => {
    expect(previewSource(drawing)).toBe(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawing)}`,
    )
  })

  it('keeps the drawing intact for a round trip through the address', () => {
    const address = previewSource(drawing)
    const encoded = address.slice(address.indexOf(',') + 1)
    expect(decodeURIComponent(encoded)).toBe(drawing)
  })
})
