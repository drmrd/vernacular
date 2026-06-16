// scripts/pack/pack-integrity.mjs
//
// Pure on-disk integrity checks for a vernacular-pack (design specification
// section 4.6). No direct filesystem access: it takes a parsed manifest and an
// injected PackReader, and returns the accumulated errors. When the in-app pack
// loader lands (phase 3) these checks graduate to core/ as shared TypeScript.

/**
 * @typedef {object} PackReader
 * @property {string} dirName                                   basename of the pack directory
 * @property {(rel: string) => Promise<string[]>} listDir       filenames in a subdir; [] if absent
 * @property {(rel: string) => Promise<boolean>} exists
 * @property {(rel: string) => Promise<string>} sha256          hex digest of a file's bytes
 * @property {(rel: string, length: number) => Promise<Uint8Array>} readBytes
 */

/**
 * Verify a pack's on-disk files against its manifest.
 * @param {object} _manifest
 * @param {PackReader} _reader
 * @returns {Promise<{ errors: string[] }>}
 */
export async function checkPackIntegrity(_manifest, _reader) {
  const errors = []
  // Specific integrity checks are added as their behaviors are specified.
  return { errors }
}
