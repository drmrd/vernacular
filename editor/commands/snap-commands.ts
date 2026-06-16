import { TOGGLABLE_SNAP_KINDS, type TogglableSnapKind } from '../plan/snap-preferences'
import type { SnapPreferencesStore } from '../plan/snap-preferences-store'
import type { EditorCommand } from './command'

/** How much one radius command changes the catch radius, in screen pixels. */
const SNAP_RADIUS_STEP = 2

/** Human-readable names for each running snap kind, used in command and panel labels. */
export const SNAP_KIND_LABELS: Record<TogglableSnapKind, string> = {
  endpoint: 'endpoint',
  intersection: 'intersection',
  midpoint: 'midpoint',
  edge: 'edge',
  angle: 'angle lock',
  perpendicular: 'perpendicular',
  parallel: 'parallel',
  grid: 'grid',
  trace: 'underlay corners',
}

function masterCommand(store: SnapPreferencesStore): EditorCommand {
  return {
    id: 'toggle-snapping',
    label: 'Toggle snapping',
    keybindings: ['Mod+Shift+S'],
    isEnabled: () => true,
    run: () => store.setEnabled(!store.getPreferences().enabled),
  }
}

function kindCommand(store: SnapPreferencesStore, kind: TogglableSnapKind): EditorCommand {
  return {
    id: `toggle-snap-${kind}`,
    label: `Toggle ${SNAP_KIND_LABELS[kind]} snap`,
    keybindings: [],
    isEnabled: () => true,
    run: () => store.toggleKind(kind),
  }
}

function radiusCommand(store: SnapPreferencesStore, step: number): EditorCommand {
  const widening = step > 0
  return {
    id: widening ? 'increase-snap-radius' : 'decrease-snap-radius',
    label: widening ? 'Increase snap radius' : 'Decrease snap radius',
    keybindings: [],
    isEnabled: () => true,
    run: () => store.setPixelRadius(store.getPreferences().pixelRadius + step),
  }
}

/** The snap commands: the master toggle, a toggle per running kind, and the two radius steps. */
export function createSnapCommands(store: SnapPreferencesStore): EditorCommand[] {
  return [
    masterCommand(store),
    ...TOGGLABLE_SNAP_KINDS.map((kind) => kindCommand(store, kind)),
    radiusCommand(store, SNAP_RADIUS_STEP),
    radiusCommand(store, -SNAP_RADIUS_STEP),
  ]
}
