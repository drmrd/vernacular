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
    if (import.meta.env.DEV) {
      console.error(
        '[Field] hint was supplied but the child is not a single React element. ' +
          'aria-describedby was not injected. Pass a single <input> or <select> as the child.',
      )
    }
    return control
  }
  const existing = control.props[ARIA_DESCRIBED_BY]
  const describedBy = existing ? `${existing} ${hintId}` : hintId
  return cloneElement(control, { [ARIA_DESCRIBED_BY]: describedBy })
}

export function Field({ htmlFor, label, children, hint }: FieldProps) {
  const hintId = hint ? `${htmlFor}-hint` : undefined
  return (
    <div className="ds-field">
      <label className="ds-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {hintId ? describeControl(children, hintId) : children}
      {hintId ? (
        <span className="ds-field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  )
}
