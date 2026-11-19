// What the console of the timed page means for the timing command. Pure: the driver collects the
// messages and asks here. In the real page a failure can show only as a console message, and the
// product then goes on without the feature, so the timed frames would carry a name that says more
// than was drawn.

// The texts below are matched against the messages of the product. A unit test reads the source
// file named in each comment and fails when the message is reworded: change both together.

/** Logged by bridge/react/use-ambient-occlusion.ts when the effect cannot be built. */
const AMBIENT_OCCLUSION_FAILED_TEXT = 'Failed to build the ambient-occlusion render pipeline'
/** Logged by bridge/react/scene-renderer-canvas.tsx when a stage of the renderer fails. */
const SCENE_RENDERER_FAILED_TEXT = 'Scene renderer failed to'
/** Logged by the 3D library as "THREE.WebGPURenderer: <api> Device Lost: ...", not by the product. */
const DEVICE_LOST_TEXT = 'Device Lost'
/** Logged by bridge/react/furniture-model-cache.ts: the reference project names a model no catalog holds. */
const FURNITURE_MODEL_MISSING_TEXT = 'Failed to load furniture model'
/** Logged by the 3D library, not by the product, when its clock module is used. */
const CLOCK_DEPRECATED_TEXT = 'THREE.Clock: This module has been deprecated'

/** The message types that count; every other type is ignored. */
const COUNTED_TYPES = ['warning', 'error', 'pageerror']

/**
 * The messages that make the times useless, each with the reason that the report gives.
 * @type {{ text: string, reason: string }[]}
 */
const REFUSAL_RULES = [
  {
    text: AMBIENT_OCCLUSION_FAILED_TEXT,
    reason:
      'The ambient-occlusion pipeline of the realistic lighting failed to build, so the realistic ' +
      'views were drawn without the effect and the times were discarded.',
  },
  {
    text: SCENE_RENDERER_FAILED_TEXT,
    reason: 'The scene renderer logged a failure, so the 3D times were discarded.',
  },
  {
    text: DEVICE_LOST_TEXT,
    reason: 'The graphics device was lost during the run, so the times were discarded.',
  },
]

/** The messages that are known and harmless in the reference project. */
const KNOWN_TEXTS = [FURNITURE_MODEL_MISSING_TEXT, CLOCK_DEPRECATED_TEXT]

/** @typedef {{ type: string, text: string }} PageMessage */

/**
 * Sorts the console messages of the page into refusals, unexpected messages, and a count of the
 * known harmless ones. Only warnings, errors, and page errors count. A refusal is given once per
 * kind, however often its message repeats, and its message is not also unexpected.
 * @param {PageMessage[]} messages
 * @returns {{ refusals: string[], unexpected: PageMessage[], knownCount: number }}
 */
export function classifyPageMessages(messages) {
  const counted = messages.filter((message) => COUNTED_TYPES.includes(message.type))
  const refusals = REFUSAL_RULES.filter((rule) =>
    counted.some((message) => message.text.includes(rule.text)),
  ).map((rule) => rule.reason)
  const rest = counted.filter(
    (message) => !REFUSAL_RULES.some((rule) => message.text.includes(rule.text)),
  )
  const isKnown = (/** @type {PageMessage} */ message) =>
    KNOWN_TEXTS.some((text) => message.text.includes(text))
  return {
    refusals,
    unexpected: rest.filter((message) => !isKnown(message)),
    knownCount: rest.filter(isKnown).length,
  }
}
