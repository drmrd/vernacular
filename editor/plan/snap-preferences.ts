import type { SettingKey } from '../../session'
import { SNAP_PIXEL_TOLERANCE, type SnapKind } from './snap'

/**
 * The running snap kinds a user can turn on and off, including `trace` (underlay
 * corners), which is off by default.
 */
export type TogglableSnapKind = SnapKind

/**
 * The running snap kinds in chain order, the single source of truth from which the
 * per-kind preferences map is built so the two cannot drift apart.
 */
export const TOGGLABLE_SNAP_KINDS: readonly TogglableSnapKind[] = [
  'endpoint',
  'intersection',
  'midpoint',
  'edge',
  'angle',
  'perpendicular',
  'parallel',
  'grid',
  'trace',
]

/** The smallest catch radius the preferences allow, so it never collapses to zero or negative. */
const MIN_SNAP_PIXEL_RADIUS = 1

/** Editor-level snapping preferences: a master switch, per-kind toggles, and a catch radius. */
export interface SnapPreferences {
  /** The master switch; when off, snapping is fully disabled. */
  enabled: boolean
  /** The per-kind on/off map over the running snap kinds. */
  kinds: Record<TogglableSnapKind, boolean>
  /** The catch radius in screen pixels. */
  pixelRadius: number
}

/** Build the per-kind map with every running kind set to `value`. */
function everyKind(value: boolean): Record<TogglableSnapKind, boolean> {
  const kinds = {} as Record<TogglableSnapKind, boolean>
  for (const kind of TOGGLABLE_SNAP_KINDS) {
    kinds[kind] = value
  }
  return kinds
}

/**
 * The defaults: the master on, every running kind on except underlay-corner `trace`
 * snapping (off so it never surprises a user who has not opted in), and the radius at
 * the current pixel tolerance.
 */
export const DEFAULT_SNAP_PREFERENCES: SnapPreferences = {
  enabled: true,
  kinds: { ...everyKind(true), trace: false },
  pixelRadius: SNAP_PIXEL_TOLERANCE,
}

/** Return a new preferences value with `kind` flipped, leaving the input unchanged. */
export function toggleSnapKind(prefs: SnapPreferences, kind: TogglableSnapKind): SnapPreferences {
  return {
    ...prefs,
    kinds: { ...prefs.kinds, [kind]: !prefs.kinds[kind] },
  }
}

/** Return a new preferences value with the master switch set, leaving the input unchanged. */
export function setSnapEnabled(prefs: SnapPreferences, enabled: boolean): SnapPreferences {
  return { ...prefs, enabled }
}

/**
 * Return a new preferences value with the catch radius set, clamped up to the minimum
 * so it never collapses to zero or negative. The input is left unchanged.
 */
export function setSnapPixelRadius(prefs: SnapPreferences, radius: number): SnapPreferences {
  return { ...prefs, pixelRadius: Math.max(MIN_SNAP_PIXEL_RADIUS, radius) }
}

/** Whether a single running kind is on, independent of the master switch. */
export function isSnapKindEnabled(prefs: SnapPreferences, kind: TogglableSnapKind): boolean {
  return prefs.kinds[kind]
}

/**
 * Read the stored per-kind map one known kind at a time. A kind that is missing or is not a
 * boolean takes its default, and a kind this build does not know is ignored.
 */
function parseSnapKinds(stored: unknown): Record<TogglableSnapKind, boolean> {
  const storedKinds: Record<string, unknown> =
    typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {}
  const kinds = {} as Record<TogglableSnapKind, boolean>
  for (const kind of TOGGLABLE_SNAP_KINDS) {
    const flag = storedKinds[kind]
    kinds[kind] = typeof flag === 'boolean' ? flag : DEFAULT_SNAP_PREFERENCES.kinds[kind]
  }
  return kinds
}

/**
 * Read a stored value field by field, filling each missing or mistyped field from the
 * defaults. A value that is not an object, or is null, gives `undefined`.
 */
function parseSnapPreferences(raw: unknown): SnapPreferences | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined
  }
  const value = raw as Partial<Record<keyof SnapPreferences, unknown>>
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_SNAP_PREFERENCES.enabled,
    kinds: parseSnapKinds(value.kinds),
    pixelRadius:
      typeof value.pixelRadius === 'number'
        ? value.pixelRadius
        : DEFAULT_SNAP_PREFERENCES.pixelRadius,
  }
}

/**
 * The user setting that keeps the snap preferences. Browsers that ran an older build carry
 * their stored preferences over to this name.
 */
export const SNAP_PREFERENCES_SETTING: SettingKey<SnapPreferences> = {
  name: 'snapPreferences',
  defaultValue: DEFAULT_SNAP_PREFERENCES,
  parse: parseSnapPreferences,
}
