import { dirname, join, relative, sep } from 'node:path'
import ts from 'typescript'

/** The folders that may read a wall's ends: the geometric kernel. */
export const KERNEL_FOLDERS = ['core/geometry/', 'core/topology/', 'core/migrations/']

/** How a production file reaches a wall's `start` or `end`. */
export type WallEndForm = 'access' | 'destructuring' | 'argument'

export interface WallEndRead {
  file: string
  line: number
  form: WallEndForm
}

const PRODUCTION_FOLDERS = [
  'core/',
  'storage/',
  'session/',
  'engine/',
  'bridge/',
  'editor/',
  'app/',
  'src/',
]
const SOURCE_FILE = /\.tsx?$/
const TEST_ASSET_NAME =
  /\.(test|spec)\.|\.stories\.tsx$|-(test-support|test-kit|test-fixtures|story-support)\.|-contract\.ts$/
const TEST_ASSET_FOLDER = /(^|\/)(testing|fixtures)\//
const GENERATED_FOLDER = 'core/format/generated/'

const WALL_TYPES = [
  { name: 'Wall', file: 'core/model/types.ts' },
  { name: 'WallSceneNode', file: 'core/scene/scene-graph.ts' },
]
const END_NAMES = ['start', 'end']
const LINE_NUMBER_OFFSET = 1

interface Scan {
  checker: ts.TypeChecker
  rootDir: string
}

/** Whether a repository-relative path is shipped code, not a test, story, fixture, or generated file. */
export function isProductionSource(path: string): boolean {
  return (
    SOURCE_FILE.test(path) &&
    PRODUCTION_FOLDERS.some((folder) => path.startsWith(folder)) &&
    !TEST_ASSET_NAME.test(path) &&
    !TEST_ASSET_FOLDER.test(path) &&
    !path.startsWith(GENERATED_FOLDER)
  )
}

function isInKernel(path: string): boolean {
  return KERNEL_FOLDERS.some((folder) => path.startsWith(folder))
}

function repositoryPath(scan: Scan, fileName: string): string {
  return relative(scan.rootDir, fileName).split(sep).join('/')
}

function isRepositoryFile(path: string): boolean {
  return !path.startsWith('..') && !path.includes('node_modules/')
}

function isWallDeclaration(scan: Scan, node: ts.Node): boolean {
  if (!ts.isInterfaceDeclaration(node)) return false
  const file = repositoryPath(scan, node.getSourceFile().fileName)
  return WALL_TYPES.some((wall) => wall.name === node.name.text && wall.file === file)
}

/** Whether a property is declared on a wall type, also when reached through a pick or a subtype. */
function isWallEndProperty(scan: Scan, property: ts.Symbol | undefined): boolean {
  return (property?.getDeclarations() ?? []).some((declaration) =>
    isWallDeclaration(scan, declaration.parent),
  )
}

function hasWallEndNamed(scan: Scan, type: ts.Type, names: readonly string[]): boolean {
  const bare = scan.checker.getNonNullableType(type)
  return names.some((name) => isWallEndProperty(scan, scan.checker.getPropertyOfType(bare, name)))
}

function isWallType(scan: Scan, type: ts.Type): boolean {
  return hasWallEndNamed(scan, type, END_NAMES)
}

function endName(name: ts.Node | undefined): string | undefined {
  if (name === undefined) return undefined
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined
}

function isEndName(name: ts.Node | undefined): boolean {
  const text = endName(name)
  return text !== undefined && END_NAMES.includes(text)
}

/** The names of `start` and `end` that a key's type holds, as a string literal or a union of them. */
function endKeyNames(type: ts.Type): string[] {
  if (type.isStringLiteral()) return END_NAMES.filter((name) => name === type.value)
  return type.isUnion() ? type.types.flatMap(endKeyNames) : []
}

function readsWallEnd(scan: Scan, node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node) && isEndName(node.name)) {
    return isWallEndProperty(scan, scan.checker.getSymbolAtLocation(node.name))
  }
  if (!ts.isElementAccessExpression(node)) return false
  const names = endKeyNames(scan.checker.getTypeAtLocation(node.argumentExpression))
  return hasWallEndNamed(scan, scan.checker.getTypeAtLocation(node.expression), names)
}

function endNamesOf(pattern: ts.ObjectBindingPattern): string[] {
  return pattern.elements
    .map((element) => endName(element.propertyName ?? element.name))
    .filter((name): name is string => name !== undefined && END_NAMES.includes(name))
}

function accessOrDestructuringForm(scan: Scan, node: ts.Node): WallEndForm | undefined {
  if (readsWallEnd(scan, node)) return 'access'
  if (!ts.isObjectBindingPattern(node)) return undefined
  const type = scan.checker.getTypeAtLocation(node)
  return hasWallEndNamed(scan, type, endNamesOf(node)) ? 'destructuring' : undefined
}

function elementTypeOfList(scan: Scan, type: ts.Type): ts.Type | undefined {
  if (!scan.checker.isArrayType(type)) return undefined
  return scan.checker.getTypeArguments(type as ts.TypeReference)[0]
}

/** Whether an argument of this type is a wall, a list of walls, or neither. */
function wallArgumentShape(scan: Scan, type: ts.Type): 'wall' | 'list' | undefined {
  const bare = scan.checker.getNonNullableType(type)
  const element = elementTypeOfList(scan, bare)
  if (element !== undefined) return isWallType(scan, element) ? 'list' : undefined
  return isWallType(scan, bare) ? 'wall' : undefined
}

function declaredParameterType(
  scan: Scan,
  declaration: ts.SignatureDeclaration,
  index: number,
): ts.Type | undefined {
  const parameter = declaration.parameters[Math.min(index, declaration.parameters.length - 1)]
  if (parameter === undefined) return undefined
  const written = scan.checker.getNonNullableType(scan.checker.getTypeAtLocation(parameter))
  const declared =
    parameter.dotDotDotToken === undefined ? written : (elementTypeOfList(scan, written) ?? written)
  return scan.checker.getBaseConstraintOfType(declared) ?? declared
}

function hasEndProperty(scan: Scan, type: ts.Type): boolean {
  return END_NAMES.some((name) => scan.checker.getPropertyOfType(type, name) !== undefined)
}

function isStructuralEndParameter(
  scan: Scan,
  parameterType: ts.Type,
  passesList: boolean,
): boolean {
  const target = passesList
    ? (elementTypeOfList(scan, parameterType) ?? parameterType)
    : parameterType
  return hasEndProperty(scan, target) && !isWallType(scan, target)
}

// Passing a wall to the kernel is the sanctioned route, so only other callees count as a read.
function isNonKernelRepositoryCallee(scan: Scan, declaration: ts.SignatureDeclaration): boolean {
  const path = repositoryPath(scan, declaration.getSourceFile().fileName)
  return isRepositoryFile(path) && !isInKernel(path)
}

function passesWallToStructuralParameter(
  scan: Scan,
  call: ts.CallExpression | ts.NewExpression,
): boolean {
  const declaration = scan.checker.getResolvedSignature(call)?.getDeclaration()
  if (declaration === undefined || !isNonKernelRepositoryCallee(scan, declaration)) return false
  return (call.arguments ?? []).some((argument, index) => {
    const shape = wallArgumentShape(scan, scan.checker.getTypeAtLocation(argument))
    const parameterType = declaredParameterType(scan, declaration, index)
    return (
      shape !== undefined &&
      parameterType !== undefined &&
      isStructuralEndParameter(scan, parameterType, shape === 'list')
    )
  })
}

function formOfNode(scan: Scan, node: ts.Node): WallEndForm | undefined {
  const read = accessOrDestructuringForm(scan, node)
  if (read !== undefined) return read
  const isCall = ts.isCallExpression(node) || ts.isNewExpression(node)
  return isCall && passesWallToStructuralParameter(scan, node) ? 'argument' : undefined
}

function readsInFile(scan: Scan, source: ts.SourceFile, file: string): WallEndRead[] {
  const reads: WallEndRead[] = []
  const visit = (node: ts.Node): void => {
    const form = formOfNode(scan, node)
    if (form !== undefined) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
      reads.push({ file, line: line + LINE_NUMBER_OFFSET, form })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return reads
}

/** Every place a production file outside the kernel reaches a wall's `start` or `end` by type. */
export function findWallEndReads(program: ts.Program, rootDir: string): WallEndRead[] {
  const scan: Scan = { checker: program.getTypeChecker(), rootDir }
  return program.getSourceFiles().flatMap((source) => {
    const file = repositoryPath(scan, source.fileName)
    const scanned = isRepositoryFile(file) && isProductionSource(file) && !isInKernel(file)
    return scanned ? readsInFile(scan, source, file) : []
  })
}

/** A read as one line, `file:line form`, for assertions and failure messages. */
export function describeWallEndRead(read: WallEndRead): string {
  return `${read.file}:${read.line} ${read.form}`
}

/** The sorted, unique files of a set of reads. */
export function wallEndReadFiles(reads: readonly WallEndRead[]): string[] {
  return [...new Set(reads.map((read) => read.file))].sort()
}

/** A type-checked program over the files of a tsconfig. */
export function programOfConfig(configPath: string): ts.Program {
  const read = ts.readConfigFile(configPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(configPath))
  const errors = [read.error, ...parsed.errors].filter((error) => error !== undefined)
  if (errors.length > 0) {
    const messages = errors.map(({ messageText }) =>
      ts.flattenDiagnosticMessageText(messageText, '\n'),
    )
    throw new Error(`Cannot read ${configPath}:\n${messages.join('\n')}`)
  }
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options })
}

/** A type-checked program over virtual files, each a repository-relative path and its text. */
export function programOfVirtualFiles(
  rootDir: string,
  sources: readonly (readonly [path: string, text: string])[],
): ts.Program {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  }
  const host = ts.createCompilerHost(options)
  const virtual = new Map(sources.map(([path, text]) => [join(rootDir, path), text]))
  const { fileExists, readFile, directoryExists, getSourceFile } = host
  host.fileExists = (name) => virtual.has(name) || fileExists.call(host, name)
  host.readFile = (name) => virtual.get(name) ?? readFile.call(host, name)
  host.directoryExists = (name) =>
    [...virtual.keys()].some((path) => path.startsWith(`${name}/`)) ||
    (directoryExists?.call(host, name) ?? false)
  host.getSourceFile = (name, languageVersion, ...rest) => {
    const text = virtual.get(name)
    return text === undefined
      ? getSourceFile.call(host, name, languageVersion, ...rest)
      : ts.createSourceFile(name, text, languageVersion)
  }
  return ts.createProgram({ rootNames: [...virtual.keys()], options, host })
}
