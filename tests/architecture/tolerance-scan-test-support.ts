import ts from 'typescript'

const SCANNED_LAYERS: readonly string[] = ['core', 'session', 'engine', 'bridge', 'editor', 'app']
const SMALL_VALUE_FOLDERS: readonly string[] = [
  'core/geometry/',
  'core/topology/',
  'core/scene/',
  'engine/scene/',
]
const TOLERANCE_MODULE_PATH = 'core/geometry/tolerance.ts'
const TOLERANCE_VALUE_CEILING = 1e-3

const NOT_PRODUCTION_PATTERN =
  /\.(test|spec|stories)\.tsx?$|-test-(support|fixtures|kit)\.tsx?$|-contract\.ts$|\.d\.ts$|(^|\/)(testing|__tests__)\/|^core\/format\/generated\//
const TOLERANCE_NAME_PATTERN = /(^|_)(EPS|EPSILON|TOLERANCE)(_|$)/
const EXPONENT_LITERAL_PATTERN = /^\d+(\.\d+)?e-\d+$/i

const COMPARISON_OPERATORS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
])

/** A `const` declaration: its name and, when it has one, its initializer. */
export interface ConstDeclaration {
  readonly name: string
  readonly initializer: ts.Expression | undefined
}

function isConstDeclaration(node: ts.Node): node is ts.VariableDeclaration {
  return (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    ts.isVariableDeclarationList(node.parent) &&
    (node.parent.flags & ts.NodeFlags.Const) !== 0
  )
}

function collectNodes<T extends ts.Node>(
  node: ts.Node,
  matches: (candidate: ts.Node) => candidate is T,
): T[] {
  const found: T[] = matches(node) ? [node] : []
  ts.forEachChild(node, (child) => void found.push(...collectNodes(child, matches)))
  return found
}

function parse(path: string, text: string): ts.SourceFile {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
}

/** Every `const` declaration of a file, at any depth. */
export function constDeclarations(path: string, text: string): ConstDeclaration[] {
  return constDeclarationsOf(parse(path, text))
}

function constDeclarationsOf(sourceFile: ts.SourceFile): ConstDeclaration[] {
  return collectNodes(sourceFile, isConstDeclaration).map((declaration) => ({
    name: (declaration.name as ts.Identifier).text,
    initializer: declaration.initializer,
  }))
}

function numericValue(expression: ts.Expression | undefined): number | undefined {
  if (expression === undefined) return undefined
  if (ts.isNumericLiteral(expression)) return Number(expression.text)
  const negated =
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expression.operand)
  return negated ? -Number(expression.operand.text) : undefined
}

function isSmallNonZero(value: number | undefined): boolean {
  return value !== undefined && value !== 0 && Math.abs(value) < TOLERANCE_VALUE_CEILING
}

function isScanned(path: string): boolean {
  return (
    SCANNED_LAYERS.includes(path.split('/')[0] ?? '') &&
    !NOT_PRODUCTION_PATTERN.test(path) &&
    path !== TOLERANCE_MODULE_PATH
  )
}

function namedTolerances(declarations: readonly ConstDeclaration[]): string[] {
  return declarations
    .filter((declaration) => TOLERANCE_NAME_PATTERN.test(declaration.name))
    .map((declaration) => declaration.name)
}

function smallValued(path: string, declarations: readonly ConstDeclaration[]): string[] {
  if (!SMALL_VALUE_FOLDERS.some((folder) => path.startsWith(folder))) return []
  return declarations
    .filter((declaration) => isSmallNonZero(numericValue(declaration.initializer)))
    .map((declaration) => declaration.name)
}

function isComparison(node: ts.Node): node is ts.BinaryExpression {
  return ts.isBinaryExpression(node) && COMPARISON_OPERATORS.has(node.operatorToken.kind)
}

function exponentOperands(node: ts.BinaryExpression, sourceFile: ts.SourceFile): string[] {
  return [node.left, node.right]
    .filter((operand) => ts.isNumericLiteral(operand))
    .map((operand) => operand.getText(sourceFile))
    .filter((literal) => EXPONENT_LITERAL_PATTERN.test(literal))
}

function exponentLiterals(sourceFile: ts.SourceFile): string[] {
  return collectNodes(sourceFile, isComparison).flatMap((node) =>
    exponentOperands(node, sourceFile),
  )
}

function findingsOfFile(path: string, text: string): string[] {
  const sourceFile = parse(path, text)
  const declarations = constDeclarationsOf(sourceFile)
  const names = [...namedTolerances(declarations), ...smallValued(path, declarations)]
  return [...new Set([...names, ...exponentLiterals(sourceFile)])].map(
    (finding) => `${path}: ${finding}`,
  )
}

/**
 * `<path>: <name>` for each geometric tolerance declared outside `core/geometry/tolerance.ts`, sorted.
 *
 * - Scanned: production `.ts` and `.tsx` files under `core/`, `session/`, `engine/`, `bridge/`,
 *   `editor/`, and `app/`. Tests, specs, stories, test support, fixtures, kits, contracts, `.d.ts`
 *   files, `testing/` and `__tests__/` folders, and generated format code are skipped.
 * - Name rule: a `const` whose name has the word EPS, EPSILON, or TOLERANCE.
 * - Literal rule: a comparison with an exponent literal such as `1e-9`, reported by the literal text.
 * - Value rule: a `const` set to a number with `0 < |value| < 1e-3`, in `core/geometry/`,
 *   `core/topology/`, `core/scene/`, or `engine/scene/`. Zero is not a tolerance.
 *
 * Each pair of a file and a finding is reported once.
 */
export function findGeometricTolerances(sources: ReadonlyMap<string, string>): string[] {
  return [...sources]
    .filter(([path]) => isScanned(path))
    .flatMap(([path, text]) => findingsOfFile(path, text))
    .sort()
}
