import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  RESIZE_FURNITURE,
  ROTATE_FURNITURE,
  SET_FURNITURE_HEIGHT,
  SET_FURNITURE_NAME,
  createFurnitureInstance,
  parseLength,
  type Command,
  type ResizeFurnitureParams,
  type RotateFurnitureParams,
  type SetFurnitureHeightParams,
} from '../../core'
import { FurnitureInspector } from './furniture-inspector'

// A single selected furniture item, fixed so the formatted values and the
// dispatched command payloads are all deterministic. A metric project reads a
// bare number as millimeters, matching the active system's assume-unit.
const FLOOR_ID = 'floor-1'
const FURNITURE_ID = 'f1'
const WIDTH_MM = 600
const DEPTH_MM = 400
const HEIGHT_MM = 750
const UNITS = 'metric' as const
const METRIC_ASSUMED_UNIT = 'mm' as const

const NEW_NAME = 'Reading Chair'
const NEW_ANGLE = '45'
const EXPECTED_ANGLE_RADIANS = (45 * Math.PI) / 180
const QUARTER_TURN_RADIANS = Math.PI / 2
const QUARTER_TURN_DEGREES = '90'
const NEW_WIDTH_ENTRY = '800'
const EXPECTED_NEW_WIDTH_MM = parseLength(NEW_WIDTH_ENTRY, {
  assumeUnit: METRIC_ASSUMED_UNIT,
})
const NEW_DEPTH_ENTRY = '500'
const EXPECTED_NEW_DEPTH_MM = parseLength(NEW_DEPTH_ENTRY, {
  assumeUnit: METRIC_ASSUMED_UNIT,
})
const NEW_HEIGHT_ENTRY = '900'
const EXPECTED_NEW_HEIGHT_MM = parseLength(NEW_HEIGHT_ENTRY, {
  assumeUnit: METRIC_ASSUMED_UNIT,
})

function buildFurniture(rotation = 0) {
  return createFurnitureInstance({
    id: FURNITURE_ID,
    assetRef: { scope: 'user', contentHash: 'h' },
    position: { x: 0, y: 0 },
    footprint: { width: WIDTH_MM, depth: DEPTH_MM },
    height: HEIGHT_MM,
    rotation,
    name: 'Chair',
  })
}

function renderInspector(dispatch: (command: unknown) => void, rotation = 0) {
  render(
    <FurnitureInspector
      floorId={FLOOR_ID}
      furniture={buildFurniture(rotation)}
      units={UNITS}
      dispatch={dispatch as never}
    />,
  )
}

function commandOfType<P>(
  dispatch: ReturnType<typeof vi.fn>,
  type: string,
): Command<P> | undefined {
  return dispatch.mock.calls.find((call) => call[0]?.type === type)?.[0] as Command<P> | undefined
}

afterEach(cleanup)

describe('FurnitureInspector', () => {
  it('dispatches setFurnitureName with the typed name when the name is committed', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch)

    const nameInput = screen.getByLabelText('Name')
    await user.clear(nameInput)
    await user.type(nameInput, `${NEW_NAME}{Enter}`)

    const command = commandOfType<{ floorId: string; furnitureId: string; name: string }>(
      dispatch,
      SET_FURNITURE_NAME,
    )
    expect(command).toBeDefined()
    expect(command?.params).toEqual({
      floorId: FLOOR_ID,
      furnitureId: FURNITURE_ID,
      name: NEW_NAME,
    })
  })

  it('dispatches rotateFurniture with the parsed degrees when the angle is committed', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch)

    const angleInput = screen.getByLabelText('Angle (deg)')
    await user.clear(angleInput)
    await user.type(angleInput, `${NEW_ANGLE}{Enter}`)

    const command = commandOfType<RotateFurnitureParams>(dispatch, ROTATE_FURNITURE)
    expect(command).toBeDefined()
    expect(command?.params.floorId).toBe(FLOOR_ID)
    expect(command?.params.furnitureId).toBe(FURNITURE_ID)
    expect(command?.params.rotation).toBeCloseTo(EXPECTED_ANGLE_RADIANS, 10)
  })

  it('dispatches setFurnitureName with the typed name when the name is committed on blur', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch)

    const nameInput = screen.getByLabelText('Name')
    await user.clear(nameInput)
    await user.type(nameInput, NEW_NAME)
    await user.tab()

    const command = commandOfType<{ floorId: string; furnitureId: string; name: string }>(
      dispatch,
      SET_FURNITURE_NAME,
    )
    expect(command).toBeDefined()
    expect(command?.params).toEqual({
      floorId: FLOOR_ID,
      furnitureId: FURNITURE_ID,
      name: NEW_NAME,
    })
  })

  it('dispatches rotateFurniture with the parsed degrees when the angle is committed on blur', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch)

    const angleInput = screen.getByLabelText('Angle (deg)')
    await user.clear(angleInput)
    await user.type(angleInput, NEW_ANGLE)
    await user.tab()

    const command = commandOfType<RotateFurnitureParams>(dispatch, ROTATE_FURNITURE)
    expect(command).toBeDefined()
    expect(command?.params.floorId).toBe(FLOOR_ID)
    expect(command?.params.furnitureId).toBe(FURNITURE_ID)
    expect(command?.params.rotation).toBeCloseTo(EXPECTED_ANGLE_RADIANS, 10)
  })

  it('shows the furniture rotation converted to degrees in the Angle field', () => {
    renderInspector(vi.fn(), QUARTER_TURN_RADIANS)

    const angleInput = screen.getByLabelText('Angle (deg)') as HTMLInputElement
    expect(angleInput.value).toBe(QUARTER_TURN_DEGREES)
  })
})

describe('FurnitureInspector dimensions', () => {
  it('dispatches resizeFurniture with the new width and unchanged depth when the width is committed', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch)

    const widthInput = screen.getByLabelText('Width (mm)')
    await user.clear(widthInput)
    await user.type(widthInput, `${NEW_WIDTH_ENTRY}{Enter}`)

    const command = commandOfType<ResizeFurnitureParams>(dispatch, RESIZE_FURNITURE)
    expect(command).toBeDefined()
    expect(command?.params).toEqual({
      floorId: FLOOR_ID,
      furnitureId: FURNITURE_ID,
      footprint: { width: EXPECTED_NEW_WIDTH_MM, depth: DEPTH_MM },
    })
  })

  it('dispatches resizeFurniture with unchanged width and the new depth when the depth is committed', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch)

    const depthInput = screen.getByLabelText('Depth (mm)')
    await user.clear(depthInput)
    await user.type(depthInput, `${NEW_DEPTH_ENTRY}{Enter}`)

    const command = commandOfType<ResizeFurnitureParams>(dispatch, RESIZE_FURNITURE)
    expect(command).toBeDefined()
    expect(command?.params).toEqual({
      floorId: FLOOR_ID,
      furnitureId: FURNITURE_ID,
      footprint: { width: WIDTH_MM, depth: EXPECTED_NEW_DEPTH_MM },
    })
  })

  it('shows the furniture instance height in the Height field', () => {
    renderInspector(vi.fn())

    const heightInput = screen.getByLabelText('Height (mm)') as HTMLInputElement
    expect(parseLength(heightInput.value, { assumeUnit: METRIC_ASSUMED_UNIT })).toBe(HEIGHT_MM)
  })

  it('dispatches setFurnitureHeight with the parsed height when the height is committed', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderInspector(dispatch)

    const heightInput = screen.getByLabelText('Height (mm)')
    await user.clear(heightInput)
    await user.type(heightInput, `${NEW_HEIGHT_ENTRY}{Enter}`)

    const command = commandOfType<SetFurnitureHeightParams>(dispatch, SET_FURNITURE_HEIGHT)
    expect(command).toBeDefined()
    expect(command?.params).toEqual({
      floorId: FLOOR_ID,
      furnitureId: FURNITURE_ID,
      height: EXPECTED_NEW_HEIGHT_MM,
    })
  })
})
