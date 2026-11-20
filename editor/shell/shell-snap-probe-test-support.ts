import { createElement, type ReactElement } from 'react'
import { useSnapPreferences, useSnapPreferencesStore } from '../plan/snap-preferences-context'

/**
 * A component of the tests. It is built with `createElement` in a `.ts` file, so that this support
 * module exports no component of the application.
 */

/** Shows the grid snapping of the shell's snap preferences, and turns it over on a click. */
export function SnapProbe(): ReactElement {
  const preferences = useSnapPreferences()
  const store = useSnapPreferencesStore()
  return createElement(
    'button',
    { type: 'button', onClick: () => store.toggleKind('grid') },
    preferences.kinds.grid ? 'Grid snapping on' : 'Grid snapping off',
  )
}
