import { SNAP_KIND_LABELS } from '../commands/snap-commands'
import { TOGGLABLE_SNAP_KINDS, type TogglableSnapKind } from './snap-preferences'
import { useSnapPreferences, useSnapPreferencesStore } from './snap-preferences-context'
import './snap-panel.css'

const MIN_RADIUS = 1

function titleCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

interface SnapKindToggleProps {
  kind: TogglableSnapKind
  checked: boolean
  onToggle: () => void
}

function SnapKindToggle({ kind, checked, onToggle }: SnapKindToggleProps) {
  return (
    <label className="snap-panel__kind">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      {titleCase(SNAP_KIND_LABELS[kind])}
    </label>
  )
}

/** The precision snapping panel: a master toggle, a per-kind toggle, and the catch radius. */
export function SnapPanel() {
  const preferences = useSnapPreferences()
  const store = useSnapPreferencesStore()
  return (
    <section className="snap-panel" aria-label="Snapping preferences">
      <label className="snap-panel__master">
        <input
          type="checkbox"
          checked={preferences.enabled}
          onChange={() => store.setEnabled(!preferences.enabled)}
        />
        Snapping
      </label>
      <fieldset className="snap-panel__kinds" disabled={!preferences.enabled}>
        <legend>Snap to</legend>
        {TOGGLABLE_SNAP_KINDS.map((kind) => (
          <SnapKindToggle
            key={kind}
            kind={kind}
            checked={preferences.kinds[kind]}
            onToggle={() => store.toggleKind(kind)}
          />
        ))}
      </fieldset>
      <label className="snap-panel__radius">
        Catch radius
        <input
          type="number"
          min={MIN_RADIUS}
          value={preferences.pixelRadius}
          onChange={(event) => store.setPixelRadius(Number(event.target.value))}
        />
      </label>
    </section>
  )
}
