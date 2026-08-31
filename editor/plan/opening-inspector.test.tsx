import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
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
import {
  FLOOR_ID,
  HEIGHT_MM,
  OPENING_ID,
  SILL_HEIGHT_MM,
  UNITS,
  buildOpeningOfWidth,
  renderInspector,
} from './opening-inspector-test-helpers'

// The metric entry unit defaults to metres and the value is shown bare, so an
// 813 mm width reads as "0.813".
const EXPECTED_WIDTH = '0.813'
const METRIC_ASSUMED_UNIT = 'm' as const

const NEW_WIDTH_ENTRY = '0.9'
const EXPECTED_NEW_WIDTH_MM = parseLength(NEW_WIDTH_ENTRY, { assumeUnit: METRIC_ASSUMED_UNIT })
const UNPARSEABLE_ENTRY = 'abc'

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

  it('groups the cased opening under its own Passages optgroup in the type select', () => {
    renderInspector(vi.fn())

    const typeSelect = screen.getByRole('combobox', { name: /opening type/i })
    const passages = within(typeSelect).getByRole('group', { name: 'Passages' })

    expect(within(passages).getByRole('option', { name: /cased opening/i })).toBeInTheDocument()
  })
})
