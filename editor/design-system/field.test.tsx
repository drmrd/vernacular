import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Field } from './field'

afterEach(cleanup)

describe('Field', () => {
  it('renders a label associated with its control', () => {
    render(
      <Field htmlFor="x" label="Name">
        <input id="x" />
      </Field>,
    )
    const control = screen.getByLabelText('Name')
    expect(control).toBe(screen.getByRole('textbox'))
    expect(screen.getByText('Name')).toBeInTheDocument()
  })

  it('applies the design-system field layout and label classes', () => {
    render(
      <Field htmlFor="x" label="Name">
        <input id="x" />
      </Field>,
    )
    expect(screen.getByText('Name')).toHaveClass('ds-field__label')
    expect(screen.getByText('Name').closest('.ds-field')).not.toBeNull()
  })

  it('renders an optional hint associated for assistive tech', () => {
    render(
      <Field htmlFor="x" label="Name" hint="must be positive">
        <input id="x" />
      </Field>,
    )
    const hint = screen.getByText('must be positive')
    expect(hint).toHaveClass('ds-field__hint')
    expect(hint).toHaveAttribute('id', 'x-hint')
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-describedby', 'x-hint')
  })
})
