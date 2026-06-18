import type { ButtonHTMLAttributes } from 'react'
import './icon-button.css'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  // The labeled affordance relaxes the square icon button to fit an icon plus a
  // text label (or a text-only readout), widening the padding from the icon shape.
  labeled?: boolean
}

export function IconButton({ type = 'button', labeled, className, ...rest }: IconButtonProps) {
  const classes = ['ds-icon-button', labeled ? 'ds-icon-button--labeled' : null, className]
    .filter(Boolean)
    .join(' ')
  return <button type={type} className={classes} {...rest} />
}
