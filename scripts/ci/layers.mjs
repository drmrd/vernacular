// scripts/ci/layers.mjs
//
// Pure helpers describing the enforced layer DAG (see eslint.config.js
// `layerRules`) and the reverse-dependency closure that picks which layers'
// co-located unit tests a change can affect. No filesystem or process access.
// eslint-plugin-boundaries forbids upward imports, which is what makes the
// reverse closure sound at layer granularity.

/**
 * The layer stack in dependency order, lowest first. A layer may import only
 * from layers earlier in this list.
 * @type {readonly string[]}
 */
export const LAYERS = ['core', 'storage', 'engine', 'bridge', 'editor', 'app']

/**
 * Map a repo-relative file path to its layer, or null if it is not in a layer.
 *
 * @param {string} file
 * @returns {string | null}
 */
export function layerOf(file) {
  const top = file.split('/')[0]
  return LAYERS.includes(top) ? top : null
}

/**
 * Reverse-dependency closure: given the changed layers, return the lowest one
 * and every layer above it. Because the stack is a linear chain, that is a
 * suffix of LAYERS.
 *
 * @param {Iterable<string>} changedLayers
 * @returns {string[]} affected layers, lowest first (empty when none match)
 */
export function affectedLayers(changedLayers) {
  const indices = [...changedLayers]
    .map((layer) => LAYERS.indexOf(layer))
    .filter((index) => index !== -1)
  if (indices.length === 0) {
    return []
  }
  return LAYERS.slice(Math.min(...indices))
}
