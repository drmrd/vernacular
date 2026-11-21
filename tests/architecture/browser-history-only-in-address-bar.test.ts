// @vitest-environment node
// The sources are read from disk through Node's fs module, which needs the node environment, not the project-wide jsdom.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readLayerSources } from './import-graph'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))

// Reading about 1,700 source files outlasts the default limit under load.
const SOURCE_SCAN_TIMEOUT_MS = 30_000

const ADDRESS_BAR = 'app/address-bar.ts'
const PLANTED_FILE = 'app/sample.ts'
const ENTRY_POINT_DIRECTORY = 'src'

const SOURCE_FILE_PATTERN = /\.tsx?$/
const NOT_PRODUCTION_PATTERN =
  /\.(test|spec|stories)\.tsx?$|\.d\.ts$|-test-(support|kit)\.tsx?$|(^|\/)__tests__\//

// The events and calls that move or read the browser history, the `history` member of a window, the
// global `history` with a member of the browser history, and a write of the hash, which adds an
// entry. The bare word `history` is left out: undo history names it too.
const BROWSER_HISTORY_PATTERN =
  /\b(?:popstate|hashchange|pushState|replaceState)\b|\.history\b|\bhistory\.(?:back|forward|go|state|length)\b|\blocation\.hash\s*=/

/**
 * Every `path:line` of a production file other than the address bar that names the browser
 * history. Comments are not stripped, so a comment that names it counts too.
 */
function findHistoryNamingsOutsideTheAddressBar(sources: ReadonlyMap<string, string>): string[] {
  return [...sources]
    .filter(([path]) => path !== ADDRESS_BAR && !NOT_PRODUCTION_PATTERN.test(path))
    .flatMap(([path, text]) =>
      text
        .split('\n')
        .flatMap((line, index) =>
          BROWSER_HISTORY_PATTERN.test(line) ? [`${path}:${index + 1}`] : [],
        ),
    )
    .sort()
}

/** The sources of the layers and of the entry points under `src/`, by path from the root. */
function readProductionSources(): Map<string, string> {
  const sources = readLayerSources(repositoryRoot)
  const entries = readdirSync(join(repositoryRoot, ENTRY_POINT_DIRECTORY), {
    recursive: true,
    encoding: 'utf8',
  })
  for (const entry of entries.filter((name) => SOURCE_FILE_PATTERN.test(name))) {
    const path = `${ENTRY_POINT_DIRECTORY}/${entry.split('\\').join('/')}`
    sources.set(path, readFileSync(join(repositoryRoot, path), 'utf8'))
  }
  return sources
}

function plantedSource(path: string, text: string): Map<string, string> {
  return new Map([[path, text]])
}

describe('the scan for the browser history outside the address bar', () => {
  it.each([
    ['a listener of popstate', "window.addEventListener('popstate', onMove)\n"],
    ['a listener of hashchange', "window.addEventListener('hashchange', onMove)\n"],
    ['a call of pushState', "window.history.pushState(null, '', '#/projects')\n"],
    ['a call of replaceState', "view.history.replaceState(null, '', '')\n"],
    ['a call of history.back', 'history.back()\n'],
    ['a call of history.forward', 'history.forward()\n'],
    ['a call of history.go', 'history.go(-1)\n'],
    ['a read of history.state', 'const kept = history.state\n'],
    ['a write of location.hash', "window.location.hash = '#/projects'\n"],
  ])('reports the path and line of a file with %s', (_label, text) => {
    const sources = plantedSource('editor/sample.ts', `export const a = 1\n${text}`)

    expect(findHistoryNamingsOutsideTheAddressBar(sources)).toEqual(['editor/sample.ts:2'])
  })

  it('reports a file under the entry points', () => {
    const sources = plantedSource('src/sample.ts', "window.addEventListener('popstate', onMove)\n")

    expect(findHistoryNamingsOutsideTheAddressBar(sources)).toEqual(['src/sample.ts:1'])
  })

  it('does not report the address bar', () => {
    const sources = plantedSource(ADDRESS_BAR, "window.addEventListener('popstate', onMove)\n")

    expect(findHistoryNamingsOutsideTheAddressBar(sources)).toEqual([])
  })

  it('does not report a variable that is named history, or the word in a plain sentence', () => {
    const text =
      '// Keeps the undo history.\nconst history = useOwnership(session)\nhistory.mark()\n'

    expect(findHistoryNamingsOutsideTheAddressBar(plantedSource(PLANTED_FILE, text))).toEqual([])
  })

  it.each([
    'app/sample.test.ts',
    'app/sample.test.tsx',
    'app/sample.stories.tsx',
    'app/sample-test-support.ts',
    'session/handle/sample-test-kit.ts',
    'app/__tests__/sample.ts',
  ])('leaves out tests, stories, and test support: %s', (path) => {
    const sources = plantedSource(path, "window.addEventListener('popstate', onMove)\n")

    expect(findHistoryNamingsOutsideTheAddressBar(sources)).toEqual([])
  })
})

describe('the production files of the application', () => {
  const sources = readProductionSources()

  it('include the address bar and an entry point', () => {
    expect([...sources.keys()], 'sources read').toEqual(
      expect.arrayContaining([ADDRESS_BAR, 'src/main.tsx']),
    )
  })

  it(
    'name the browser history only in app/address-bar.ts',
    { timeout: SOURCE_SCAN_TIMEOUT_MS },
    () => {
      const namings = findHistoryNamingsOutsideTheAddressBar(sources)

      expect(namings, 'files that touch the browser history outside app/address-bar.ts').toEqual([])
    },
  )
})
