import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Command, Site } from '../../core'
import { SiteEditor } from './site-editor'

afterEach(cleanup)

// Some engines report a key of a composition as key code 229 instead of isComposing.
const COMPOSITION_KEY_CODE = 229
const RADIANS_PER_DEGREE = Math.PI / 180

const SITE: Site = { latLong: { latitude: 42.36, longitude: -71.06 } }

interface CommittingField {
  readonly name: string
  readonly label: RegExp
  readonly site: Site
  readonly typed: string
  readonly expectedParams: Record<string, unknown>
}

// Every input field of the site editor that commits its value on Enter. The first
// editable field of the editor, latitude, comes first and is the representative one.
const FIELDS: ReadonlyArray<CommittingField> = [
  {
    name: 'latitude',
    label: /latitude/i,
    site: SITE,
    typed: '40',
    expectedParams: { latLong: { latitude: 40, longitude: -71.06 } },
  },
  {
    name: 'longitude',
    label: /longitude/i,
    site: SITE,
    typed: '10',
    expectedParams: { latLong: { latitude: 42.36, longitude: 10 } },
  },
  {
    name: 'north bearing',
    label: /north bearing/i,
    site: SITE,
    typed: '45',
    expectedParams: { northBearing: expect.closeTo(45 * RADIANS_PER_DEGREE) },
  },
  {
    name: 'timezone',
    label: /timezone/i,
    site: {},
    typed: 'America/New_York',
    expectedParams: { timezone: 'America/New_York' },
  },
]

// The user-event library does not model input-method composition, so the keys of a
// composition are fired as raw keydown events with the init that a browser sends.
function renderEditedField(field: CommittingField) {
  const dispatch = vi.fn()
  render(<SiteEditor site={field.site} dispatch={dispatch} />)
  const input = screen.getByLabelText(field.label)
  input.focus()
  fireEvent.change(input, { target: { value: field.typed } })
  return { input, dispatch }
}

function committedCommands(dispatch: ReturnType<typeof vi.fn>): Command[] {
  return dispatch.mock.calls.map((call) => call[0] as Command)
}

describe.each(FIELDS)('a key of a text composition in the $name field', (field) => {
  it(`commits nothing on an Enter marked as composing in the ${field.name} field`, () => {
    const { input, dispatch } = renderEditedField(field)

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })

    expect(dispatch).toHaveBeenCalledTimes(0)
  })

  it(`commits nothing on an Enter with the legacy composition key code in the ${field.name} field`, () => {
    const { input, dispatch } = renderEditedField(field)

    fireEvent.keyDown(input, { key: 'Enter', keyCode: COMPOSITION_KEY_CODE })

    expect(dispatch).toHaveBeenCalledTimes(0)
  })

  it(`commits once with the new value on the plain Enter after a composing Enter in the ${field.name} field`, async () => {
    const { input, dispatch } = renderEditedField(field)

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    await userEvent.keyboard('{Enter}')

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(committedCommands(dispatch)[0]?.params).toEqual(field.expectedParams)
  })

  it(`still commits once on blur after a composing Enter in the ${field.name} field`, async () => {
    const { input, dispatch } = renderEditedField(field)

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    await userEvent.tab()

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(committedCommands(dispatch)[0]?.params).toEqual(field.expectedParams)
  })

  it(`commits once on a plain Enter with no composition in the ${field.name} field`, async () => {
    const { dispatch } = renderEditedField(field)

    await userEvent.keyboard('{Enter}')

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(committedCommands(dispatch)[0]?.params).toEqual(field.expectedParams)
  })
})
