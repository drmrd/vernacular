// The producer (the live canvas in webgpu-scene-view.tsx) and the consumer (the
// editor pane's readiness observer in scene-pane.tsx) both need to agree on the
// same test id and attribute name to talk to each other through the DOM. This
// module is the one place that names them, so the two sides can never drift out
// of sync, and mirrors the data-harness-ready attribute scene-harness-view.tsx
// already uses for the same purpose in the visual-regression harness.
export const LIVE_SCENE_CANVAS_TEST_ID = 'live-scene-canvas'
export const SCENE_READY_ATTRIBUTE = 'data-harness-ready'

// A local name for the standard testing-library attribute, held as a computed key
// below rather than a literal object-property name so the hyphenated HTML
// attribute does not trip the project's camelCase naming convention.
const TEST_ID_ATTRIBUTE = 'data-testid'

export function sceneReadinessProps(ready: boolean): Record<string, string> {
  return {
    [TEST_ID_ATTRIBUTE]: LIVE_SCENE_CANVAS_TEST_ID,
    [SCENE_READY_ATTRIBUTE]: ready ? 'true' : 'false',
  }
}
