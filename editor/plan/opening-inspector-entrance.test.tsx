import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { clearMainEntrance, createOpening, markMainEntrance, type Opening } from '../../core'
import { OpeningInspector } from './opening-inspector'
import { FLOOR_ID, OPENING_ID, buildOpening } from './opening-inspector-test-support'

const GUESS_NOTE = 'Vernacular treats this door as the entrance until one is marked.'
const HUNG_WINDOW_SILL_MM = 900
const WINDOW_WIDTH_MM = 813
const WINDOW_HEIGHT_MM = 1200

function buildWindow(): Opening {
  return createOpening({
    type: 'double-hung-window',
    hostWallId: 'w1',
    position: 1000,
    width: WINDOW_WIDTH_MM,
    height: WINDOW_HEIGHT_MM,
    sillHeight: HUNG_WINDOW_SILL_MM,
    id: OPENING_ID,
  })
}

function renderWithRole(
  dispatch: (command: unknown) => void,
  entranceRole: 'marked' | 'guessed' | 'other' | undefined,
  opening: Opening = buildOpening(),
) {
  render(
    <OpeningInspector
      floorId={FLOOR_ID}
      opening={opening}
      units="metric"
      siblingOpenings={[]}
      dispatch={dispatch as never}
      entranceRole={entranceRole}
    />,
  )
}

afterEach(cleanup)

describe('OpeningInspector main entrance checkbox', () => {
  it('shows an unticked "Main entrance" checkbox and no note on a door that is neither marked nor guessed', () => {
    renderWithRole(vi.fn(), 'other')

    expect(screen.getByRole('checkbox', { name: 'Main entrance' })).not.toBeChecked()
    expect(screen.queryByText(GUESS_NOTE)).not.toBeInTheDocument()
  })

  it('dispatches the mark command for this door when the checkbox is ticked', async () => {
    const dispatch = vi.fn()
    renderWithRole(dispatch, 'other')

    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Main entrance' }))

    expect(dispatch).toHaveBeenCalledTimes(1)
    const expected = markMainEntrance(FLOOR_ID, OPENING_ID)
    const [command] = dispatch.mock.calls[0] as [typeof expected]
    expect(command.type).toBe(expected.type)
    expect(command.params).toEqual(expected.params)
  })

  it('ticks the checkbox on the marked door and dispatches the clear command when it is unticked', async () => {
    const dispatch = vi.fn()
    renderWithRole(dispatch, 'marked')

    const checkbox = screen.getByRole('checkbox', { name: 'Main entrance' })
    expect(checkbox).toBeChecked()
    await userEvent.setup().click(checkbox)

    expect(dispatch).toHaveBeenCalledTimes(1)
    const expected = clearMainEntrance()
    const [command] = dispatch.mock.calls[0] as [typeof expected]
    expect(command.type).toBe(expected.type)
    expect(command.params).toEqual(expected.params)
  })

  it('leaves the checkbox unticked on the guessed door and explains the guess', () => {
    renderWithRole(vi.fn(), 'guessed')

    expect(screen.getByRole('checkbox', { name: 'Main entrance' })).not.toBeChecked()
    expect(screen.getByText(GUESS_NOTE)).toBeInTheDocument()
  })

  it('does not show the checkbox on a window', () => {
    renderWithRole(vi.fn(), 'other', buildWindow())

    expect(screen.queryByRole('checkbox', { name: 'Main entrance' })).not.toBeInTheDocument()
  })
})
