import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

import { OpeningTypeChooser } from './opening-type-chooser'

afterEach(cleanup)

describe('OpeningTypeChooser', () => {
  it('offers the leafless passage under a name a user would look for', () => {
    render(<OpeningTypeChooser />)

    expect(screen.getByRole('option', { name: 'Cased Opening (open doorway)' })).toBeInTheDocument()
  })

  it('leaves the door families named as the registry names them', () => {
    render(<OpeningTypeChooser />)

    expect(screen.getByRole('option', { name: 'Single Swing Door' })).toBeInTheDocument()
  })

  it('groups the cased opening under its own Passages optgroup, apart from Doors', () => {
    render(<OpeningTypeChooser />)

    const passages = screen.getByRole('group', { name: 'Passages' })
    expect(within(passages).getByRole('option', { name: /cased opening/i })).toBeInTheDocument()

    const doors = screen.getByRole('group', { name: 'Doors' })
    expect(within(doors).queryByRole('option', { name: /cased opening/i })).toBeNull()
  })
})
