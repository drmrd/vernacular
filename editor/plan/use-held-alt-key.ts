import { useEffect, useState } from 'react'

/**
 * The single Alt-held (Option on a Mac) tracker shared by the wall drawing tool and
 * wall endpoint editing. While `active`, it attaches window keydown/keyup listeners
 * that mirror `event.altKey` into state, so callers can read whether Alt is currently
 * held; releasing Alt clears it. When `active` is false the listeners are removed and
 * the held state resets to false. Holding Alt suppresses the default angle lock so a
 * dragged endpoint or the drawing cursor follows a free angle.
 */
export function useHeldAltKey(active: boolean): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (!active) {
      setHeld(false)
      return
    }
    const update = (event: KeyboardEvent) => setHeld(event.altKey)
    window.addEventListener('keydown', update)
    window.addEventListener('keyup', update)
    return () => {
      window.removeEventListener('keydown', update)
      window.removeEventListener('keyup', update)
    }
  }, [active])
  return held
}
