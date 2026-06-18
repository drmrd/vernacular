import type { ButtonHTMLAttributes } from 'react'
import './icon-button.css'

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement>

export function IconButton({ type = 'button', className, ...rest }: IconButtonProps) {
  const classes = ['ds-icon-button', className].filter(Boolean).join(' ')
  return <button type={type} className={classes} {...rest} />
}
