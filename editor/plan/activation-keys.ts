const ACTIVATION_KEYS: ReadonlySet<string> = new Set(['Enter', ' '])

// The keys that activate a focused element: Enter and Space. The entity proxy
// selects on them, and the authoring key listener keeps such a handled press
// away from the tool, so both read this one definition.
export function isActivationKey(event: { key: string }): boolean {
  return ACTIVATION_KEYS.has(event.key)
}
