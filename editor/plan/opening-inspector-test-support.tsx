import { render } from '@testing-library/react'
import { createOpening, type Opening } from '../../core'
import { OpeningInspector } from './opening-inspector'

// A single selected opening, fixed so the formatted values and the dispatched
// command payloads are all deterministic. A metric field defaults its entry unit
// to metres, so a bare number is read as metres.
export const FLOOR_ID = 'floor-1'
export const OPENING_ID = 'o1'
export const WIDTH_MM = 813
export const HEIGHT_MM = 2032
export const SILL_HEIGHT_MM = 0
export const UNITS = 'metric' as const

export function buildOpening(): Opening {
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

export function buildOpeningOfWidth(width: number): Opening {
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

export function renderInspector(
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
