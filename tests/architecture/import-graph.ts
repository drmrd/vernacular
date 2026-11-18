import { readFileSync, readdirSync } from 'node:fs'
import { join, posix } from 'node:path'
import ts from 'typescript'

const LAYER_DIRECTORIES = ['app', 'bridge', 'core', 'editor', 'engine', 'session', 'storage']
const SOURCE_FILE_PATTERN = /\.tsx?$/
const RESOLUTION_SUFFIXES = ['', '.ts', '.tsx', '/index.ts']
const MINIMUM_CYCLE_SIZE = 2

function allSpecifiersAreTypeOnly(
  elements: ts.NodeArray<ts.ImportSpecifier | ts.ExportSpecifier>,
): boolean {
  return elements.length > 0 && elements.every((element) => element.isTypeOnly)
}

function isTypeOnlyImport(declaration: ts.ImportDeclaration): boolean {
  const clause = declaration.importClause
  if (clause === undefined) return false
  if (clause.isTypeOnly) return true
  if (clause.name !== undefined) return false
  const bindings = clause.namedBindings
  return bindings !== undefined && ts.isNamedImports(bindings)
    ? allSpecifiersAreTypeOnly(bindings.elements)
    : false
}

function isTypeOnlyExport(declaration: ts.ExportDeclaration): boolean {
  if (declaration.isTypeOnly) return true
  const clause = declaration.exportClause
  return clause !== undefined && ts.isNamedExports(clause)
    ? allSpecifiersAreTypeOnly(clause.elements)
    : false
}

function valueImportSpecifier(statement: ts.Statement): string | undefined {
  if (ts.isImportDeclaration(statement) && !isTypeOnlyImport(statement)) {
    return (statement.moduleSpecifier as ts.StringLiteral).text
  }
  if (
    ts.isExportDeclaration(statement) &&
    statement.moduleSpecifier !== undefined &&
    !isTypeOnlyExport(statement)
  ) {
    return (statement.moduleSpecifier as ts.StringLiteral).text
  }
  return undefined
}

function valueImportSpecifiers(path: string, text: string): string[] {
  const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest)
  return sourceFile.statements.flatMap((statement) => {
    const specifier = valueImportSpecifier(statement)
    return specifier === undefined ? [] : [specifier]
  })
}

function resolveSpecifier(
  importerPath: string,
  specifier: string,
  sources: ReadonlyMap<string, string>,
): string | undefined {
  if (!specifier.startsWith('.')) return undefined
  const base = posix.normalize(posix.join(posix.dirname(importerPath), specifier))
  return RESOLUTION_SUFFIXES.map((suffix) => base + suffix).find((candidate) =>
    sources.has(candidate),
  )
}

function buildValueImportGraph(sources: ReadonlyMap<string, string>): Map<string, string[]> {
  const graph = new Map<string, string[]>()
  for (const [path, text] of sources) {
    const targets = valueImportSpecifiers(path, text)
      .map((specifier) => resolveSpecifier(path, specifier, sources))
      .filter((target): target is string => target !== undefined)
    graph.set(path, targets)
  }
  return graph
}

interface TarjanState {
  readonly graph: ReadonlyMap<string, string[]>
  readonly index: Map<string, number>
  readonly lowLink: Map<string, number>
  readonly stack: string[]
  readonly onStack: Set<string>
  readonly components: string[][]
}

function popComponent(state: TarjanState, root: string): string[] {
  const component: string[] = []
  let member: string | undefined
  do {
    member = state.stack.pop()
    if (member === undefined) break
    state.onStack.delete(member)
    component.push(member)
  } while (member !== root)
  return component
}

function visit(state: TarjanState, node: string): void {
  const order = state.index.size
  state.index.set(node, order)
  state.lowLink.set(node, order)
  state.stack.push(node)
  state.onStack.add(node)
  for (const target of state.graph.get(node) ?? []) {
    if (!state.index.has(target)) {
      visit(state, target)
      state.lowLink.set(node, Math.min(state.lowLink.get(node)!, state.lowLink.get(target)!))
    } else if (state.onStack.has(target)) {
      state.lowLink.set(node, Math.min(state.lowLink.get(node)!, state.index.get(target)!))
    }
  }
  if (state.lowLink.get(node) === order) state.components.push(popComponent(state, node))
}

/** Cycles among `sources` (repository-relative path to source text). Value imports only. */
export function findValueImportCycles(sources: ReadonlyMap<string, string>): string[][] {
  const state: TarjanState = {
    graph: buildValueImportGraph(sources),
    index: new Map(),
    lowLink: new Map(),
    stack: [],
    onStack: new Set(),
    components: [],
  }
  for (const node of state.graph.keys()) {
    if (!state.index.has(node)) visit(state, node)
  }
  return state.components
    .filter((component) => component.length >= MINIMUM_CYCLE_SIZE)
    .map((component) => component.sort())
    .sort((first, second) => first.join().localeCompare(second.join()))
}

/** Every `.ts` and `.tsx` file under the layer directories. */
export function readLayerSources(repositoryRoot: string): Map<string, string> {
  const sources = new Map<string, string>()
  for (const layer of LAYER_DIRECTORIES) {
    const entries = readdirSync(join(repositoryRoot, layer), { recursive: true, encoding: 'utf8' })
    for (const entry of entries.filter((name) => SOURCE_FILE_PATTERN.test(name))) {
      const path = posix.join(layer, entry.split('\\').join('/'))
      sources.set(path, readFileSync(join(repositoryRoot, path), 'utf8'))
    }
  }
  return sources
}
