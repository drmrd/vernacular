// @vitest-environment node
// Pure byte/zip logic; node aligns Uint8Array realms with the fflate-backed codec.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createDocumentValidator } from '../../core'
import {
  buildAttributions,
  buildBuildingArchiveEntries,
  type CorpusLicenseMeta,
} from '../../scripts/fixtures/pack-building-archive.mjs'
import { SCHEMA_VERSION } from '../../scripts/schema/build-schema.mjs'
import { unzipFolder, zipFolder } from '../../storage/zip/zip-codec'

const planSlug = '27-chateau-de-pierrefonds-castle-turret-curved-walls-plan'
const corpusDir = resolve('resources/floor-plans', planSlug)

const schemaPath = resolve('schema', String(SCHEMA_VERSION), 'vernacular.schema.json')
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
const validate = createDocumentValidator(schema)

const document = JSON.parse(
  readFileSync(resolve('tests/fixtures/projects/corpus', `${planSlug}.vernacular.json`), 'utf8'),
)
const meta = JSON.parse(readFileSync(resolve(corpusDir, 'meta.json'), 'utf8')) as CorpusLicenseMeta
const rasterBytes = new Uint8Array(
  readFileSync(resolve(corpusDir, 'chateau-de-pierrefonds-castle-turret-curved-walls-plan.png')),
)

const underlay = document.floors[0].underlays[0] as {
  source: { image: { contentHash: string } }
}
const contentHash = underlay.source.image.contentHash

describe('Tier-0 corpus plan packed into a conformant .building archive', () => {
  // Pack and unpack once through the real codec inside the Vitest lifecycle, so a codec
  // failure is attributed to this suite rather than crashing test collection.
  let unpacked: Map<string, Uint8Array>

  // The pack/unpack round trip and the raster byte comparison are CPU-heavy. Run alone
  // they finish in about two seconds, but under the full suite's parallel workers the byte
  // comparison can run past the default five-second budget, so give these a generous ceiling.
  beforeAll(() => {
    const attributions = buildAttributions(meta)
    const entries = buildBuildingArchiveEntries({
      document,
      rasterBytes,
      contentHash,
      attributions,
    })
    unpacked = unzipFolder(zipFolder(entries))
  }, 30_000)

  it('embeds a CORE-valid Document as vernacular.json', () => {
    const bytes = unpacked.get('vernacular.json')
    expect(bytes).toBeDefined()
    const parsed = JSON.parse(new TextDecoder().decode(bytes))
    expect(validate(parsed).valid).toBe(true)
  })

  it('stores the underlay raster under assets/<contentHash>', () => {
    const asset = unpacked.get(`assets/${contentHash}`)
    expect(asset).toBeDefined()
    expect(asset).toEqual(rasterBytes)
  }, 30_000)

  it('generates an ATTRIBUTIONS.md carrying the license and creator', () => {
    const bytes = unpacked.get('ATTRIBUTIONS.md')
    expect(bytes).toBeDefined()
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain(meta.license)
    expect(text).toContain(meta.creator)
  })
})
