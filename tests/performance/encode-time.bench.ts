import { bench, describe } from 'vitest'
import { encodeDocument } from '../../core/format/codec/encode-document'
import { createReferenceProject } from './reference-project'

const project = createReferenceProject()
const firstEncode = encodeDocument(project, undefined)

if (firstEncode.faults.length > 0) {
  throw new Error(`The reference project has faults: ${JSON.stringify(firstEncode.faults)}`)
}

const previousBytes = firstEncode.bytes

describe('encoding the reference project', () => {
  bench('with its own bytes as the previous file, so the graft runs', () => {
    encodeDocument(project, previousBytes)
  })

  bench('with no previous file, so there is nothing to graft', () => {
    encodeDocument(project, undefined)
  })
})
