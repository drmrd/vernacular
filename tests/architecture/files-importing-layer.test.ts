import { describe, expect, it } from 'vitest'
import { filesImportingLayer } from './import-graph'

const BRIDGE_LAYERS = ['bridge']

function importersOfStorage(source: string): string[] {
  return filesImportingLayer(new Map([['bridge/sample.ts', source]]), BRIDGE_LAYERS, 'storage')
}

describe('finding the files that import a layer', () => {
  it.each([
    ['a value import', "import { Store } from '../storage'\nexport const value = Store\n"],
    ['a type import', "import type { Store } from '../storage'\nexport type Value = Store\n"],
    ['a re-export', "export { Store } from '../storage'\n"],
    ['a dynamic import call', "export const load = () => import('../storage')\n"],
    [
      'a dynamic import call inside a nested function',
      "export function outer() {\n  return () => {\n    return import('../storage/store')\n  }\n}\n",
    ],
  ])('finds a file that reaches the layer through %s', (_label, source) => {
    expect(importersOfStorage(source)).toEqual(['bridge/sample.ts'])
  })

  it('does not find a file whose dynamic import call names another layer', () => {
    expect(importersOfStorage("export const load = () => import('../core')\n")).toEqual([])
  })

  it('does not find a file whose dynamic import call names a package', () => {
    expect(importersOfStorage("export const load = () => import('storage')\n")).toEqual([])
  })

  it('does not find a file outside the importer layers', () => {
    const sources = new Map([['engine/sample.ts', "import('../storage')\n"]])

    expect(filesImportingLayer(sources, BRIDGE_LAYERS, 'storage')).toEqual([])
  })
})
