// The producer (the live canvas in live-scene-view.tsx, which writes the attribute through
// the boundary in scene-readiness-boundary.tsx) and the consumer (the
// editor pane's readiness observer in scene-pane.tsx) both need to agree on the
// same test id and attribute name to talk to each other through the DOM. This
// module is the one place that names them, so the two sides can never drift out
// of sync, and mirrors the data-harness-ready attribute scene-harness-view.tsx
// already uses for the same purpose in the visual-regression harness.
export const LIVE_SCENE_CANVAS_TEST_ID = 'live-scene-canvas'
export const SCENE_READY_ATTRIBUTE = 'data-harness-ready'
export const SCENE_REVISION_ATTRIBUTE = 'data-scene-revision'
export const DRAWN_REVISION_ATTRIBUTE = 'data-drawn-revision'

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

/** The two revision attributes; drawn is '' until the first counted frame. */
export function sceneRevisionProps(revisions: {
  sceneRevision: number
  drawnRevision: number | null
}): Record<string, string> {
  return {
    [SCENE_REVISION_ATTRIBUTE]: String(revisions.sceneRevision),
    [DRAWN_REVISION_ATTRIBUTE]:
      revisions.drawnRevision === null ? '' : String(revisions.drawnRevision),
  }
}

/** Why the scene renderer could not run: its module did not load, or it could not be built or started. */
export type SceneRendererFailureKind = 'load' | 'start'

/**
 * Marks the element that stands in for the 3D canvas when its renderer failed. The value is a
 * SceneRendererFailureKind. The editor's scene pane reads it to drop its loading and empty-floor
 * overlays.
 */
export const SCENE_RENDERER_FAILED_ATTRIBUTE = 'data-scene-renderer-failed'

export function sceneRendererFailedProps(kind: SceneRendererFailureKind): Record<string, string> {
  return { [SCENE_RENDERER_FAILED_ATTRIBUTE]: kind }
}
