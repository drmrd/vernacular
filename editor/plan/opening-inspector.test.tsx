import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  FLIP_OPENING,
  REMOVE_OPENING,
  RESIZE_OPENING,
  SET_OPENING_TYPE,
  createOpening,
  parseLength,
  type Command,
  type FlipOpeningParams,
  type Opening,
  type OpeningDimensions,
  type RemoveOpeningParams,
  type ResizeOpeningParams,
  type SetOpeningTypeParams,
} from '../../core'
import { OpeningInspector } from './opening-inspector'

// A single selected opening, fixed so the formatted values and the dispatched
// command payloads are all deterministic. A metric project reads a bare number
// as millimeters, matching the active system's assume-unit.
const FLOOR_ID = 'floor-1'
const OPENING_ID = 'o1'
const WIDTH_MM = 813
const HEIGHT_MM = 2032
const SILL_HEIGHT_MM = 0
const UNITS = 'metric' as const
const METRIC_ASSUMED_UNIT = 'mm' as const

// A door-width-scale length reads in centimetres with one decimal under the
// adaptive metric rule: 813 mm renders as "81.3 cm", not "813 mm".
const EXPECTED_WIDTH = '81.3 cm'

const NEW_WIDTH_ENTRY = '900'
const EXPECTED_NEW_WIDTH_MM = parseLength(NEW_WIDTH_ENTRY, { assumeUnit: METRIC_ASSUMED_UNIT })
const UNPARSEABLE_ENTRY = 'abc'

function buildOpening(): Opening {
  return createOpening({
    type: 'single-swing-door',
    hostWallId: 'w1',
    position: 1000,
    width: WIDTH_MM,
    height: HEIGHT_MM,
    sillHeight: SILL_HEIGHT_MM,
    id: OPENING_ID,
  })
}

function renderInspector(
  dispatch: (command: unknown) => void,
  units: 'metric' | 'imperial' = UNITS,
) {
  render(
    <OpeningInspector
      floorId={FLOOR_ID}
      opening={buildOpening()}
      units={units}
      dispatch={dispatch as never}
    />,
  )
}

function onlyCommand<P>(dispatch: ReturnType<typeof vi.fn>): Command<P> {
  return dispatch.mock.calls[0]?.[0] as Command<P>
}

afterEach(cleanup)

describe('OpeningInspector', () => {
  it('shows the opening width formatted for the active units in a labeled input', () => {
    renderInspector(vi.fn())

    const widthInput = screen.getByLabelText(/width/i)
    expect(widthInput).toHaveValue(EXPECTED_WIDTH)
  })

  it('renders labeled numeric inputs for width, height, and sill height', () => {
    renderInspector(vi.fn())

    expect(screen.getByLabelText(/width/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Height (mm)', { exact: true })).toBeInTheDocument()
    expect(screen.getByLabelText(/sill height/i)).toBeInTheDocument()
  })

  it('dispatches resizeOpening with the parsed width and unchanged height and sill when width is committed', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch)

    const widthInput = screen.getByLabelText(/width/i)
    await user.clear(widthInput)
    await user.type(widthInput, `${NEW_WIDTH_ENTRY}{Enter}`)

    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = onlyCommand<ResizeOpeningParams>(dispatch)
    expect(command.type).toBe(RESIZE_OPENING)
    expect(command.params.floorId).toBe(FLOOR_ID)
    expect(command.params.openingId).toBe(OPENING_ID)
    expect(command.params.dimensions).toEqual<OpeningDimensions>({
      width: EXPECTED_NEW_WIDTH_MM,
      height: HEIGHT_MM,
      sillHeight: SILL_HEIGHT_MM,
    })
  })

  it('dispatches nothing when an unparseable width is committed', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch)

    const widthInput = screen.getByLabelText(/width/i)
    await user.clear(widthInput)
    await user.type(widthInput, `${UNPARSEABLE_ENTRY}{Enter}`)

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('dispatches flipOpening on the hinge axis from the flip hinge control', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch)

    await user.click(screen.getByRole('button', { name: /flip hinge/i }))

    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = onlyCommand<FlipOpeningParams>(dispatch)
    expect(command.type).toBe(FLIP_OPENING)
    expect(command.params.axis).toBe('hinge')
  })

  it('dispatches flipOpening on the facing axis from the flip swing control', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch)

    await user.click(screen.getByRole('button', { name: /flip (swing|facing)/i }))

    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = onlyCommand<FlipOpeningParams>(dispatch)
    expect(command.type).toBe(FLIP_OPENING)
    expect(command.params.axis).toBe('facing')
  })
})

describe('OpeningInspector remove and options', () => {
  it('does not dispatch removeOpening on the first Remove click; it asks for confirmation instead', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch)

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    // The first click never deletes; it only enters the confirm state.
    expect(dispatch).not.toHaveBeenCalled()

    // The plain Remove button is replaced by an explicit confirm and a cancel.
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Confirm remove' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('dispatches removeOpening once for the floor and opening after Remove is confirmed', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch)

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await user.click(screen.getByRole('button', { name: 'Confirm remove' }))

    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = onlyCommand<RemoveOpeningParams>(dispatch)
    expect(command.type).toBe(REMOVE_OPENING)
    expect(command.params.floorId).toBe(FLOOR_ID)
    expect(command.params.openingId).toBe(OPENING_ID)
  })

  it('aborts the removal and restores the Remove control when Cancel is clicked', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch)

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    // Cancel never deletes and returns to the plain Remove control.
    expect(dispatch).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm remove' })).toBeNull()
  })

  it('renders Remove as a destructive design-system Button, separated from the neutral Flip controls', () => {
    renderInspector(vi.fn())

    const removeButton = screen.getByRole('button', { name: /remove/i })
    const flipHinge = screen.getByRole('button', { name: /flip hinge/i })
    const flipSwing = screen.getByRole('button', { name: /flip (swing|facing)/i })

    // Remove is routed through the design-system Button with the destructive treatment.
    expect(removeButton).toHaveClass('ds-button', 'ds-button--destructive')

    // The Flip controls are routed through the design-system Button too, as neutral,
    // proving Remove is the only destructive control.
    expect(flipHinge).toHaveClass('ds-button', 'ds-button--neutral')
    expect(flipSwing).toHaveClass('ds-button', 'ds-button--neutral')

    // Remove is visually separated from the Flip pair: the two Flip controls share an
    // immediate parent, and Remove sits outside it rather than being a bare sibling.
    expect(flipHinge.parentElement).toBe(flipSwing.parentElement)
    expect(removeButton.parentElement).not.toBe(flipHinge.parentElement)
  })

  it('shows fractional-inch chip rows for each dimension field in imperial mode', () => {
    renderInspector(vi.fn(), 'imperial')

    const rows = screen.getAllByRole('list', { name: /fraction chips for/i })
    expect(rows.length).toBeGreaterThanOrEqual(3)
  })

  it('does not show fraction chips in metric mode', () => {
    renderInspector(vi.fn(), 'metric')

    expect(screen.queryByRole('list', { name: /fraction chips for/i })).toBeNull()
  })

  it('dispatches setOpeningType when a different opening type is chosen', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch)

    const typeSelect = screen.getByRole('combobox', { name: /opening type/i })
    expect(typeSelect).toHaveValue('single-swing-door')

    await user.selectOptions(typeSelect, 'double-swing-door')

    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = onlyCommand<SetOpeningTypeParams>(dispatch)
    expect(command.type).toBe(SET_OPENING_TYPE)
    expect(command.params).toEqual<SetOpeningTypeParams>({
      floorId: FLOOR_ID,
      openingId: OPENING_ID,
      type: 'double-swing-door',
    })
  })

  it('clicking a fraction chip dispatches a resize command', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch, 'imperial')

    const chip = screen.getAllByRole('button', { name: /1\/4/i })[0]!
    await user.click(chip)

    expect(dispatch).toHaveBeenCalledTimes(1)
  })
})
