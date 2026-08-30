import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

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
})
