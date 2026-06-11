// @vitest-environment node
// Pure byte/zip logic; node aligns Uint8Array realms with the fflate-backed codec.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
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
  const attributions = buildAttributions(meta)
  const entries = buildBuildingArchiveEntries({ document, rasterBytes, contentHash, attributions })
  const unpacked = unzipFolder(zipFolder(entries))

  it('embeds a CORE-valid Document as vernacular.json', () => {
    const bytes = unpacked.get('vernacular.json')
    expect(bytes).toBeDefined()
    const parsed = JSON.parse(new TextDecoder().decode(bytes))
    expect(validate(parsed).valid).toBe(true)
  })

  it('rides the underlay raster as a content-addressed asset', () => {
    const asset = unpacked.get(`assets/${contentHash}`)
    expect(asset).toBeDefined()
    expect(asset).toEqual(rasterBytes)
  })

  it('generates an ATTRIBUTIONS.md carrying the license and creator', () => {
    const bytes = unpacked.get('ATTRIBUTIONS.md')
    expect(bytes).toBeDefined()
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain(meta.license)
    expect(text).toContain(meta.creator)
  })
})
