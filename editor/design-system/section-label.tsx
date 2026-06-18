import type { HTMLAttributes, ReactNode } from 'react'
import './section-label.css'

export interface SectionLabelProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
}

export function SectionLabel({ className, children, ...rest }: SectionLabelProps) {
  const classes = ['ds-section-label', className].filter(Boolean).join(' ')
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  )
}
