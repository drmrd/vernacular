import type { KeyboardEvent } from 'react'
import './dialog-shade.css'

/** The class of the shade behind a dialog of the Projects page. */
export const DIALOG_SHADE_CLASS = 'projects-dialog-shade'

/** Escape answers the safe way and stops here, so it reaches nothing behind the dialog. */
export function answerOnEscape(answer: () => void): (event: KeyboardEvent<HTMLElement>) => void {
  return (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      answer()
    }
  }
}
