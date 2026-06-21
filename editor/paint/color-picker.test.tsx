import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  assignSurfacePaint,
  builtinPalettes,
  colorFromHex,
  readableTextColor,
  type Command,
  type SurfaceRef,
} from '../../core'
import { ColorPicker } from './color-picker'

const REF: SurfaceRef = { kind: 'floor', floorId: 'floor-1' }
const RECENT = [colorFromHex('#6e2b2b', 'Oxblood')]
const FIRST_PALETTE = Object.values(builtinPalettes.entries)[0]!
const FIRST_COLOR = FIRST_PALETTE.colors[0]!
const CANDIDATES = { light: '#fbf7ef', dark: '#2f2615' }

afterEach(cleanup)

describe('ColorPicker', () => {
  it('shows every palette color with its accessible name', () => {
    render(<ColorPicker surface={REF} finishId="matte" recent={RECENT} dispatch={vi.fn()} />)
    expect(screen.getByText(FIRST_COLOR.name)).toBeInTheDocument()
  })

  it('dispatches an assignment for the chosen color carrying the current finish', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    render(<ColorPicker surface={REF} finishId="matte" recent={RECENT} dispatch={dispatch} />)

    await user.click(screen.getByRole('button', { name: FIRST_COLOR.name }))

    const expected = assignSurfacePaint(REF, FIRST_COLOR.color, 'matte')
    const sent = dispatch.mock.calls[0]?.[0] as Command
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(sent.type).toBe(expected.type)
    expect(sent.params).toEqual(expected.params)
  })

  it('filters the palette chips by the name search', async () => {
    const user = userEvent.setup()
    render(<ColorPicker surface={REF} finishId="matte" recent={RECENT} dispatch={vi.fn()} />)

    await user.type(screen.getByLabelText(/search/i), FIRST_COLOR.name)

    expect(screen.getByText(FIRST_COLOR.name)).toBeInTheDocument()
  })

  it('paints each swatch label in the readable-text color for its own fill', () => {
    render(<ColorPicker surface={REF} finishId="matte" recent={RECENT} dispatch={vi.fn()} />)

    expect(screen.getByRole('button', { name: FIRST_COLOR.name })).toHaveStyle({
      color: readableTextColor(FIRST_COLOR.color.srgbHex, CANDIDATES),
    })
  })

  it('labels the recent colors section only when at least one recent color exists', () => {
    render(<ColorPicker surface={REF} finishId="matte" recent={RECENT} dispatch={vi.fn()} />)
    expect(screen.getByText('Recent colors')).toBeInTheDocument()

    cleanup()

    render(<ColorPicker surface={REF} finishId="matte" recent={[]} dispatch={vi.fn()} />)
    expect(screen.queryByText('Recent colors')).toBeNull()
  })
})
