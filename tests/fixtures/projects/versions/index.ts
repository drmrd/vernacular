import version8 from './v8.vernacular.json?raw'
import version9 from './v9.vernacular.json?raw'
import version10 from './v10.vernacular.json?raw'
import version11 from './v11.vernacular.json?raw'
import version12 from './v12.vernacular.json?raw'
import version13 from './v13.vernacular.json?raw'
import version14 from './v14.vernacular.json?raw'
import version15 from './v15.vernacular.json?raw'
import version16 from './v16.vernacular.json?raw'
import version17 from './v17.vernacular.json?raw'

const OLDEST_FIXTURE_VERSION = 8

/**
 * One stored document for each published schema version, as the application of
 * that version wrote it, oldest first and with no gap. The files are read as text
 * with Vite's `?raw` import, so a browser test project can load them as readily as
 * a Node one.
 */
const FIXTURE_TEXTS: readonly string[] = [
  version8,
  version9,
  version10,
  version11,
  version12,
  version13,
  version14,
  version15,
  version16,
  version17,
]

/** Every schema version that has a fixture, ascending. */
export const VERSION_FIXTURE_VERSIONS: readonly number[] = FIXTURE_TEXTS.map(
  (_text, index) => OLDEST_FIXTURE_VERSION + index,
)

/** The UTF-8 bytes of the stored document for `version`; a fresh array on each call. */
export function versionFixtureBytes(version: number): Uint8Array {
  const text = FIXTURE_TEXTS[version - OLDEST_FIXTURE_VERSION]
  if (text === undefined) {
    throw new Error(`No fixture exists for schema version ${version}`)
  }
  return new TextEncoder().encode(text)
}
