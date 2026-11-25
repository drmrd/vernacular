// scripts/pack/pack-integrity-distribution-fields.mjs
//
// Confirms the hashes and lengths a manifest states for an asset file or a
// thumbnail file against the file in the pack. The caller names each stated
// field as an entry, so this module knows nothing of pack paths.

/**
 * @typedef {object} StatedFileEntry
 * @property {string} assetHash        content hash of the asset the field belongs to
 * @property {string} label            manifest field name, such as `thumbnail.byteLength`
 * @property {string} file             pack-relative path of the file the field describes
 * @property {string} [contentHash]    the stated sha256 digest of the file
 * @property {number} [byteLength]     the stated size of the file in bytes
 */

/**
 * One entry per stated field among `contentHash` and `byteLength`; an absent field yields none.
 * @param {{ assetHash: string, file: string, labelPrefix?: string }} base
 * @param {{ contentHash?: string, byteLength?: number }} stated
 * @returns {StatedFileEntry[]}
 */
export function statedFileEntries(base, stated) {
  const { labelPrefix = '', ...target } = base
  return ['contentHash', 'byteLength']
    .filter((field) => stated[field] !== undefined)
    .map((field) => ({ ...target, label: `${labelPrefix}${field}`, [field]: stated[field] }))
}

/**
 * The problem with one stated field, or undefined when the file agrees with it.
 * @param {StatedFileEntry} entry
 * @param {import('./pack-integrity.mjs').PackReader} reader
 * @returns {Promise<string | undefined>}
 */
async function statedFileProblem(entry, reader) {
  const { label, file } = entry
  if (entry.contentHash !== undefined) {
    return entry.contentHash === (await reader.sha256(file))
      ? undefined
      : `${label} does not match ${file}`
  }
  const fileSize = await reader.size(file)
  return entry.byteLength === fileSize
    ? undefined
    : `${label} ${entry.byteLength} does not match the file size ${fileSize}`
}

/**
 * Confirm each stated hash or length equals that of its file; an absent file is skipped, as the
 * missing-file checks report it.
 * @param {StatedFileEntry[]} entries
 * @param {import('./pack-integrity.mjs').PackReader} reader
 * @param {{ errors: string[] }} context
 * @returns {Promise<void>}
 */
export async function checkStatedFiles(entries, reader, context) {
  for (const entry of entries) {
    if (!(await reader.exists(entry.file))) continue
    const problem = await statedFileProblem(entry, reader)
    if (problem !== undefined) context.errors.push(`asset ${entry.assetHash}: ${problem}`)
  }
}
