import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  assignSurfacePaint,
  assignSurfaceTreatment,
  builtinFloorPatterns,
  colorFromHex,
  getEntry,
  patternTreatment,
  type Command,
  type SurfaceRef,
} from '../../core'
import { FinishPicker, FloorPatternPicker } from './finish-picker'

const REF: SurfaceRef = { kind: 'wall-face', wallId: 'wall-1', side: 'left' }
const FLOOR_REF: SurfaceRef = { kind: 'floor', floorId: 'floor-1' }
const COLOR = colorFromHex('#9aa583')

afterEach(cleanup)

describe('FinishPicker', () => {
  it('lists the six finishes', () => {
    render(<FinishPicker surface={REF} color={COLOR} finishId="matte" dispatch={vi.fn()} />)
    expect(screen.getAllByRole('radio')).toHaveLength(6)
  })

  it('renders finish names as human-readable Title Case labels', () => {
    render(<FinishPicker surface={REF} color={COLOR} finishId="matte" dispatch={vi.fn()} />)

    expect(screen.getByText('Matte')).toBeInTheDocument()
    expect(screen.getByText('Semi-Gloss')).toBeInTheDocument()
    expect(screen.queryByText('semi-gloss')).not.toBeInTheDocument()
  })

  it('dispatches an assignment with the chosen finish and the existing color', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    render(<FinishPicker surface={REF} color={COLOR} finishId="matte" dispatch={dispatch} />)

    await user.click(screen.getByRole('radio', { name: /satin/i }))

    const expected = assignSurfacePaint(REF, COLOR, 'satin')
    const sent = dispatch.mock.calls[0]?.[0] as Command
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(sent.type).toBe(expected.type)
    expect(sent.params).toEqual(expected.params)
  })
})

describe('FloorPatternPicker', () => {
  it('lists every seeded floor pattern', () => {
    render(<FloorPatternPicker surface={FLOOR_REF} patternId={undefined} dispatch={vi.fn()} />)

    expect(screen.getAllByRole('radio')).toHaveLength(
      Object.keys(builtinFloorPatterns.entries).length,
    )
  })

  it('marks the active pattern as selected', () => {
    render(<FloorPatternPicker surface={FLOOR_REF} patternId="parquet" dispatch={vi.fn()} />)

    expect(screen.getByRole('radio', { name: /parquet/i })).toBeChecked()
  })

  it('assigns the chosen pattern with the registry scale and colors', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    render(<FloorPatternPicker surface={FLOOR_REF} patternId={undefined} dispatch={dispatch} />)

    await user.click(screen.getByRole('radio', { name: /parquet/i }))

    const parquet = getEntry(builtinFloorPatterns, 'parquet')
    const expected = assignSurfaceTreatment(
      FLOOR_REF,
      patternTreatment('parquet', parquet?.scale ?? 0, parquet?.colors ?? []),
    )
    const sent = dispatch.mock.calls[0]?.[0] as Command
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(sent.type).toBe(expected.type)
    expect(sent.params).toEqual(expected.params)
  })
})
