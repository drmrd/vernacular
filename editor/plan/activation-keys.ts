const ACTIVATION_KEYS: ReadonlySet<string> = new Set(['Enter', ' '])

// The keys that activate a focused element: Enter and Space. The entity proxy
// selects on them, and the authoring key listener and the pointer wall run keep
// such a handled press away from their tools, so all three read this one
// definition.
export function isActivationKey(event: { key: string }): boolean {
  return ACTIVATION_KEYS.has(event.key)
}

// An Enter or Space press whose default an element already prevented, such as
// the entity proxy when it selects its entity. Key listeners skip it, so that
// one press does not both select and drive a tool.
export function isActivationPressAlreadyHandled(event: KeyboardEvent): boolean {
  return event.defaultPrevented && isActivationKey(event)
}
