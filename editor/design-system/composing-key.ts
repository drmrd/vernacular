/**
 * The key code that engines without `isComposing` report for every key pressed
 * while an input method is composing text.
 */
const COMPOSITION_KEY_CODE = 229

/** A DOM keyboard event, or a React one that wraps it. */
type KeyboardEventLike = KeyboardEvent | { nativeEvent: KeyboardEvent }

/**
 * Whether a key belongs to a text composition: a person typing with an input method
 * (Japanese, Chinese or Korean text, full-width digits) presses Enter to confirm a
 * candidate or Escape to cancel it, and that key belongs to the input method, not to
 * the app. Engines report it with `isComposing` true; older ones report key code 229
 * instead (key code 229 means "processed by an input method"). `keyCode` is
 * deprecated, but it is the only signal those engines give, so it is still read.
 */
export function isComposingKey(event: KeyboardEventLike): boolean {
  const native = 'nativeEvent' in event ? event.nativeEvent : event
  return native.isComposing || native.keyCode === COMPOSITION_KEY_CODE
}
