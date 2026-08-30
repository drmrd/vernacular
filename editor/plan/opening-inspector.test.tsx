import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
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
// command payloads are all deterministic. A metric field defaults its entry unit
// to metres, so a bare number is read as metres.
const FLOOR_ID = 'floor-1'
const OPENING_ID = 'o1'
const WIDTH_MM = 813
const HEIGHT_MM = 2032
const SILL_HEIGHT_MM = 0
const UNITS = 'metric' as const
const METRIC_ASSUMED_UNIT = 'm' as const

// The metric entry unit defaults to metres and the value is shown bare, so an
// 813 mm width reads as "0.813".
const EXPECTED_WIDTH = '0.813'

const NEW_WIDTH_ENTRY = '0.9'
const EXPECTED_NEW_WIDTH_MM = parseLength(NEW_WIDTH_ENTRY, { assumeUnit: METRIC_ASSUMED_UNIT })
const UNPARSEABLE_ENTRY = 'abc'

// A width with a 1/4" remainder, so a chip that sets the fraction to 1/2" is
// distinguishable from a chip that merely adds 1/2" to whatever is already there.
const WIDTH_WITH_QUARTER_INCH_REMAINDER_MM = parseLength(`30 1/4"`)
const EXPECTED_WIDTH_WITH_HALF_INCH_REMAINDER_MM = parseLength(`30 1/2"`)

// A width with no fractional remainder at all, so no chip should read as active.
const WIDTH_WITH_NO_FRACTIONAL_REMAINDER_MM = parseLength(`30"`)

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

function buildOpeningOfWidth(width: number): Opening {
  return createOpening({
    type: 'single-swing-door',
    hostWallId: 'w1',
    position: 1000,
    width,
    height: HEIGHT_MM,
    sillHeight: SILL_HEIGHT_MM,
    id: OPENING_ID,
  })
}

function buildNeighbor(hostWallId: string, position: number, width: number): Opening {
  return createOpening({
    type: 'single-swing-door',
    hostWallId,
    position,
    width,
    height: HEIGHT_MM,
    sillHeight: SILL_HEIGHT_MM,
    id: 'o2',
  })
}

function renderInspectorForOpening(opening: Opening, siblingOpenings: readonly Opening[]) {
  render(
    <OpeningInspector
      floorId={FLOOR_ID}
      opening={opening}
      units={UNITS}
      siblingOpenings={siblingOpenings}
      dispatch={vi.fn() as never}
    />,
  )
}

function renderInspector(
  dispatch: (command: unknown) => void,
  units: 'metric' | 'imperial' = UNITS,
  overrides: { siblingOpenings?: readonly Opening[]; opening?: Opening } = {},
) {
  const { siblingOpenings = [], opening = buildOpening() } = overrides
  render(
    <OpeningInspector
      floorId={FLOOR_ID}
      opening={opening}
      units={units}
      siblingOpenings={siblingOpenings}
      dispatch={dispatch as never}
    />,
  )
}

function onlyCommand<P>(dispatch: ReturnType<typeof vi.fn>): Command<P> {
  return dispatch.mock.calls[0]?.[0] as Command<P>
}

function expectDispatchedWidth(dispatch: ReturnType<typeof vi.fn>, calls: number, width: number) {
  expect(dispatch).toHaveBeenCalledTimes(calls)
  const command = dispatch.mock.calls[calls - 1]?.[0] as Command<ResizeOpeningParams>
  expect(command).toMatchObject({
    type: RESIZE_OPENING,
    params: { dimensions: { width, height: HEIGHT_MM, sillHeight: SILL_HEIGHT_MM } },
  })
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
    expect(screen.getByLabelText('Height', { exact: true })).toBeInTheDocument()
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

  it('clamps a committed width to the largest non-overlapping span before dispatching resizeOpening', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    // A same-wall neighbor at position 1500 with width 200 has its near edge at
    // 1400. From the selected opening's center at 1000 the right gap is 400, so
    // the widest centered span that does not overlap is 800 mm.
    const neighbor = createOpening({
      type: 'single-swing-door',
      hostWallId: 'w1',
      position: 1500,
      width: 200,
      height: HEIGHT_MM,
      sillHeight: SILL_HEIGHT_MM,
      id: 'o2',
    })
    renderInspector(dispatch, UNITS, { siblingOpenings: [neighbor] })

    const widthInput = screen.getByLabelText(/width/i)
    await user.clear(widthInput)
    // 1.2 m (1200 mm) would widen the opening into the neighbor.
    await user.type(widthInput, `1.2{Enter}`)

    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = onlyCommand<ResizeOpeningParams>(dispatch)
    expect(command.type).toBe(RESIZE_OPENING)
    expect(command.params.dimensions).toEqual<OpeningDimensions>({
      width: 800,
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

describe('OpeningInspector width limit notice', () => {
  // A same-wall neighbor centered at 1700 with width 200 has its near edge at
  // 1600. From the selected opening's center at 1000 that leaves a 600 mm gap,
  // so the widest centered span clear of the neighbor is 1200 mm. An opening
  // already 1200 mm wide is sitting on that limit.
  const NEIGHBOR_POSITION_MM = 1700
  const NEIGHBOR_WIDTH_MM = 200
  const LIMIT_MM = 1200
  const LIMIT_NOTICE = 'Limited to 1.20 m by a neighboring opening on this wall.'

  it('names the neighboring opening that caps the width when the opening is already as wide as it can be', () => {
    renderInspectorForOpening(buildOpeningOfWidth(LIMIT_MM), [
      buildNeighbor('w1', NEIGHBOR_POSITION_MM, NEIGHBOR_WIDTH_MM),
    ])

    const notice = screen.getByText(LIMIT_NOTICE)
    // The explanation belongs to the Width field, so it is announced with it.
    expect(screen.getByLabelText(/width/i)).toHaveAttribute(
      'aria-describedby',
      notice.getAttribute('id') ?? '',
    )
  })

  it('says nothing about a limit when no other opening shares the host wall', () => {
    renderInspectorForOpening(buildOpeningOfWidth(LIMIT_MM), [])

    expect(screen.queryByText(/Limited to/i)).toBeNull()
  })

  it('says nothing about a limit for an opening on another wall, which cannot crowd this one', () => {
    renderInspectorForOpening(buildOpeningOfWidth(LIMIT_MM), [
      buildNeighbor('w2', NEIGHBOR_POSITION_MM, NEIGHBOR_WIDTH_MM),
    ])

    expect(screen.queryByText(/Limited to/i)).toBeNull()
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

  it('sets the fractional part of the dimension on each press, instead of adding to the current value', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch, 'imperial', {
      opening: buildOpeningOfWidth(WIDTH_WITH_QUARTER_INCH_REMAINDER_MM),
    })

    const widthChips = screen.getByRole('list', { name: /fraction chips for width/i })
    const halfInchChip = within(widthChips).getByRole('button', { name: /1\/2/i })

    // A first press sets the fraction to 1/2", it does not add 1/2" to 1/4". A
    // second press of the same chip is idempotent: it does not add a second 1/2".
    await user.click(halfInchChip)
    expectDispatchedWidth(dispatch, 1, EXPECTED_WIDTH_WITH_HALF_INCH_REMAINDER_MM)
    await user.click(halfInchChip)
    expectDispatchedWidth(dispatch, 2, EXPECTED_WIDTH_WITH_HALF_INCH_REMAINDER_MM)

    // The chip's name should describe what it now does: set the fraction, not add to it.
    expect(halfInchChip).toHaveAccessibleName(/set fraction to 1\/2 inch/i)
  })

  it('marks the fraction chip matching the current value as pressed, without any click', () => {
    renderInspector(vi.fn(), 'imperial', {
      opening: buildOpeningOfWidth(EXPECTED_WIDTH_WITH_HALF_INCH_REMAINDER_MM),
    })

    // The width already carries a 1/2" remainder, so its chip reads as pressed and no
    // other chip does, even though nothing has been clicked in this render.
    const widthChips = screen.getByRole('list', { name: /fraction chips for width/i })
    const halfInchChip = within(widthChips).getByRole('button', { name: /1\/2/i })
    const quarterInchChip = within(widthChips).getByRole('button', { name: /1\/4/i })
    expect(halfInchChip).toHaveAttribute('aria-pressed', 'true')
    expect(quarterInchChip).toHaveAttribute('aria-pressed', 'false')

    cleanup()

    // A whole-inch width carries no fractional remainder, so every chip reads unpressed.
    renderInspector(vi.fn(), 'imperial', {
      opening: buildOpeningOfWidth(WIDTH_WITH_NO_FRACTIONAL_REMAINDER_MM),
    })
    const widthChipsForWholeInch = screen.getByRole('list', { name: /fraction chips for width/i })
    within(widthChipsForWholeInch)
      .getAllByRole('button')
      .forEach((chip) => expect(chip).toHaveAttribute('aria-pressed', 'false'))
  })
})
