import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { assignSurfacePaint, colorFromHex, type Command, type SurfaceRef } from '../../core'
import { FinishPicker } from './finish-picker'

const REF: SurfaceRef = { kind: 'wall-face', wallId: 'wall-1', side: 'left' }
const COLOR = colorFromHex('#9aa583')

afterEach(cleanup)

describe('FinishPicker', () => {
  it('lists the six finishes', () => {
    render(<FinishPicker surface={REF} color={COLOR} finishId="matte" dispatch={vi.fn()} />)
    expect(screen.getAllByRole('radio')).toHaveLength(6)
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
