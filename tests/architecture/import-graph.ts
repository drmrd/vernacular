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

function statementSpecifier(statement: ts.Statement): string | undefined {
  const importsOrReexports =
    ts.isImportDeclaration(statement) ||
    (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined)
  return importsOrReexports ? (statement.moduleSpecifier as ts.StringLiteral).text : undefined
}

function dynamicImportSpecifier(node: ts.Node): string | undefined {
  if (!ts.isCallExpression(node) || node.expression.kind !== ts.SyntaxKind.ImportKeyword) {
    return undefined
  }
  const [argument] = node.arguments
  return argument !== undefined && ts.isStringLiteral(argument) ? argument.text : undefined
}

function collectDynamicImportSpecifiers(node: ts.Node, found: string[]): string[] {
  const specifier = dynamicImportSpecifier(node)
  if (specifier !== undefined) found.push(specifier)
  ts.forEachChild(node, (child) => void collectDynamicImportSpecifiers(child, found))
  return found
}

function anyModuleSpecifiers(path: string, text: string): string[] {
  const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest)
  const fromStatements = sourceFile.statements.flatMap((statement) => {
    const specifier = statementSpecifier(statement)
    return specifier === undefined ? [] : [specifier]
  })
  return [...fromStatements, ...collectDynamicImportSpecifiers(sourceFile, [])]
}

function reachesLayer(importerPath: string, specifier: string, targetLayer: string): boolean {
  if (!specifier.startsWith('.')) return false
  const target = posix.normalize(posix.join(posix.dirname(importerPath), specifier))
  return target === targetLayer || target.startsWith(`${targetLayer}/`)
}

/**
 * Sorted paths of the files in `importerLayers` that import or re-export from a relative path
 * resolving into `targetLayer`. Type-only and value statements both count, and so does a dynamic
 * `import('<string literal>')` call anywhere in the file.
 *
 * It does not see a type expression such as `import('...').T`, or the path of a `vi.mock('...')`
 * call. The lint boundary rule does not see those either.
 */
export function filesImportingLayer(
  sources: ReadonlyMap<string, string>,
  importerLayers: readonly string[],
  targetLayer: string,
): string[] {
  const importers: string[] = []
  for (const [path, text] of sources) {
    if (!importerLayers.includes(path.split('/')[0] ?? '')) continue
    const reaches = anyModuleSpecifiers(path, text).some((specifier) =>
      reachesLayer(path, specifier, targetLayer),
    )
    if (reaches) importers.push(path)
  }
  return importers.sort()
}

const STORE_LAYER = 'storage'
const MEMBER_OF_PORTS = 'workspace'
const EVERYTHING = '*'
const NOT_PRODUCTION_PATTERN = /\.(test|spec|stories)\.tsx?$|-test-support\.tsx?$|(^|\/)__tests__\//

/** Which files `filesImportingNames` scans, and the names it looks for. */
export interface NamedImportRule {
  /** The top-level directory whose production files are scanned. */
  readonly layer: string
  /** The imported names to report. */
  readonly names: readonly string[]
  /** Exact paths of production files of the layer that are not scanned. */
  readonly exempt: readonly string[]
}

function isScanned(path: string, rule: NamedImportRule): boolean {
  return (
    path.split('/')[0] === rule.layer &&
    !NOT_PRODUCTION_PATTERN.test(path) &&
    !rule.exempt.includes(path)
  )
}

function namedElements(
  statement: ts.Statement,
): readonly (ts.ImportSpecifier | ts.ExportSpecifier)[] {
  if (ts.isImportDeclaration(statement)) {
    const bindings = statement.importClause?.namedBindings
    return bindings !== undefined && ts.isNamedImports(bindings) ? bindings.elements : []
  }
  if (ts.isExportDeclaration(statement) && statement.exportClause !== undefined) {
    return ts.isNamedExports(statement.exportClause) ? statement.exportClause.elements : []
  }
  return []
}

function bringsInEverything(statement: ts.Statement): boolean {
  if (ts.isImportDeclaration(statement)) {
    const bindings = statement.importClause?.namedBindings
    return bindings !== undefined && ts.isNamespaceImport(bindings)
  }
  if (!ts.isExportDeclaration(statement)) return false
  const clause = statement.exportClause
  return clause === undefined || ts.isNamespaceExport(clause)
}

function reportedNamesOf(
  path: string,
  statement: ts.Statement,
  names: readonly string[],
): string[] {
  const specifier = statementSpecifier(statement)
  if (specifier === undefined) return []
  if (bringsInEverything(statement)) {
    return reachesLayer(path, specifier, STORE_LAYER) ? [EVERYTHING] : []
  }
  return namedElements(statement)
    .map((element) => (element.propertyName ?? element.name).text)
    .filter((name) => names.includes(name))
}

function isMemberAccess(node: ts.Node): boolean {
  return ts.isPropertyAccessExpression(node) && node.name.text === MEMBER_OF_PORTS
}

function isElementAccess(node: ts.Node): boolean {
  return (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteralLike(node.argumentExpression) &&
    node.argumentExpression.text === MEMBER_OF_PORTS
  )
}

function boundPropertyName(element: ts.BindingElement): string | undefined {
  const property = element.propertyName ?? element.name
  return ts.isIdentifier(property) || ts.isStringLiteralLike(property) ? property.text : undefined
}

function isDestructuring(node: ts.Node): boolean {
  return ts.isBindingElement(node) && boundPropertyName(node) === MEMBER_OF_PORTS
}

function reachesMemberOfPorts(node: ts.Node): boolean {
  if (isMemberAccess(node) || isElementAccess(node) || isDestructuring(node)) return true
  return ts.forEachChild(node, reachesMemberOfPorts) ?? false
}

function reportedNamesOfFile(path: string, text: string, names: readonly string[]): string[] {
  const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest)
  const imported = sourceFile.statements.flatMap((statement) =>
    reportedNamesOf(path, statement, names),
  )
  const member = reachesMemberOfPorts(sourceFile) ? [`.${MEMBER_OF_PORTS}`] : []
  return [...new Set([...imported, ...member])]
}

/**
 * `<path>: <name>` for each production file of `rule.layer` that reaches a store directly, sorted.
 *
 * - Scanned: each file whose path starts with `rule.layer/`, except a test (`.test.` or `.spec.`,
 *   or a file under `__tests__/`), a story (`.stories.`), a `-test-support` module, and the
 *   exact paths in `rule.exempt`.
 * - A file is reported with a name of `rule.names` when an import or a re-export from any path
 *   names it as the imported name: type-only or not, and also when it is renamed
 *   (`import { DocumentStore as Store }` reports `DocumentStore`).
 * - A file is reported with `*` when a namespace import (`import * as`) or an `export *` (also
 *   `export * as`) has a relative path that resolves into `storage/`.
 * - A file is reported with `.workspace` when its code reads the property `workspace` of an object
 *   in one of three ways: the member access (`ports.workspace`, `ports?.workspace`), an element
 *   access with a string literal (`ports['workspace']`), or a destructuring that binds the property
 *   (`const { workspace } = ports`, `const { workspace: store } = ports`, and the same in a
 *   parameter list). A comment, a string that is not an element access, the indexed type
 *   `SessionPorts['workspace']`, and a property of an object literal (`{ workspace: store }`, which
 *   builds ports) do not count. An assignment to a destructuring pattern and a computed key that is
 *   not a string literal are not seen.
 *
 * Each pair of a file and a name is reported once. A dynamic `import()` is not seen.
 */
export function filesImportingNames(
  sources: ReadonlyMap<string, string>,
  rule: NamedImportRule,
): string[] {
  return [...sources]
    .filter(([path]) => isScanned(path, rule))
    .flatMap(([path, text]) =>
      reportedNamesOfFile(path, text, rule.names).map((name) => `${path}: ${name}`),
    )
    .sort()
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
