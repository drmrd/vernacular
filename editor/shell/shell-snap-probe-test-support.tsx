import { useSnapPreferences, useSnapPreferencesStore } from '../plan/snap-preferences-context'

/** Shows the grid snapping of the shell's snap preferences, and turns it over on a click. */
export function SnapProbe() {
  const preferences = useSnapPreferences()
  const store = useSnapPreferencesStore()
  return (
    <button type="button" onClick={() => store.toggleKind('grid')}>
      {preferences.kinds.grid ? 'Grid snapping on' : 'Grid snapping off'}
    </button>
  )
}
