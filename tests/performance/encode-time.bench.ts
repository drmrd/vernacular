import { bench, describe } from 'vitest'
import { createPlanPreview } from '../../core'
import { encodeDocument } from '../../core/format/codec/encode-document'
import { createReferenceProject } from './reference-project'

const project = createReferenceProject()
const firstEncode = encodeDocument(project, undefined)

if (firstEncode.faults.length > 0) {
  throw new Error(`The reference project has faults: ${JSON.stringify(firstEncode.faults)}`)
}

const previousBytes = firstEncode.bytes

const xmlDeclaration = '<?xml'
const firstPreview = createPlanPreview(project)

if (firstPreview === undefined || !firstPreview.startsWith(xmlDeclaration)) {
  throw new Error('The preview of the reference project is not an SVG document.')
}

describe('encoding the reference project', () => {
  bench('with its own bytes as the previous file, so the graft runs', () => {
    encodeDocument(project, previousBytes)
  })

  bench('with no previous file, so there is nothing to graft', () => {
    encodeDocument(project, undefined)
  })
})

describe('the plan preview', () => {
  bench('of the reference project', () => {
    createPlanPreview(project)
  })
})
