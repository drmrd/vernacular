// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { importClosure } from './import-closure'

const sources = new Map([
  [
    'tests/entry.test.ts',
    "import { it } from 'vitest'\nimport { a } from '../core'\nexport { b } from '../session/b'\n",
  ],
  ['core/index.ts', "import { x } from './x'\nimport type { Node } from 'react'\nexport { x }\n"],
  ['core/x.ts', "import { jsx } from 'react/jsx-runtime'\nexport const x = jsx\n"],
  ['session/b.ts', "export const b = import('three/examples/jsm/loaders/GLTFLoader.js')\n"],
  ['session/unreached.ts', "import 'react-dom'\n"],
])

describe('the import closure of a file', () => {
  it('lists the files reached through relative imports, the entry included', () => {
    const { files } = importClosure(sources, 'tests/entry.test.ts')

    expect(files).toEqual(['core/index.ts', 'core/x.ts', 'session/b.ts', 'tests/entry.test.ts'])
  })

  it('names the packages of the closure, type-only and dynamic imports and sub-paths included', () => {
    const { packages } = importClosure(sources, 'tests/entry.test.ts')

    expect(packages).toEqual(['react', 'three', 'vitest'])
  })

  it('names a scoped package without its sub-path', () => {
    const planted = new Map([['core/a.ts', "import '@react-three/drei/core/Html'\n"]])

    expect(importClosure(planted, 'core/a.ts').packages).toEqual(['@react-three/drei'])
  })

  it('reports a relative import that no source resolves', () => {
    const planted = new Map([['core/a.ts', "import data from './data.json'\n"]])

    expect(importClosure(planted, 'core/a.ts').unresolved).toEqual(['core/a.ts: ./data.json'])
  })

  it('refuses an entry that is not among the sources', () => {
    expect(() => importClosure(sources, 'tests/missing.test.ts')).toThrow(/not in the sources/)
  })
})
