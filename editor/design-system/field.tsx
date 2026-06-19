import { cloneElement, isValidElement } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import './field.css'

export interface FieldProps {
  /** Stable id the control uses for htmlFor association. */
  htmlFor: string
  /** Visible field label. */
  label: ReactNode
  /** The control (input/select), rendered with id={htmlFor}. */
  children: ReactNode
  /** Optional below-control slot for hint/validation text. */
  hint?: ReactNode
}

const ARIA_DESCRIBED_BY = 'aria-describedby'

function describeControl(control: ReactNode, hintId: string): ReactNode {
  if (!isValidElement<HTMLAttributes<HTMLElement>>(control)) {
    return control
  }
  const existing = control.props[ARIA_DESCRIBED_BY]
  const describedBy = existing ? `${existing} ${hintId}` : hintId
  return cloneElement(control, { [ARIA_DESCRIBED_BY]: describedBy })
}

export function Field({ htmlFor, label, children, hint }: FieldProps) {
  const hintId = `${htmlFor}-hint`
  return (
    <div className="ds-field">
      <label className="ds-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {hint ? describeControl(children, hintId) : children}
      {hint ? (
        <span className="ds-field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  )
}
