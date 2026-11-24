import { dirname, relative, sep } from 'node:path'
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
const MAX_TYPE_DEPTH = 8
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

function isDeclaredAsWall(scan: Scan, type: ts.Type): boolean {
  const declarations = type.getSymbol()?.getDeclarations() ?? []
  return declarations.some((declaration) => {
    const file = repositoryPath(scan, declaration.getSourceFile().fileName)
    const name = type.getSymbol()?.getName()
    return WALL_TYPES.some((wall) => wall.name === name && wall.file === file)
  })
}

function isWallMember(scan: Scan, type: ts.Type, depth: number): boolean {
  if (depth > MAX_TYPE_DEPTH) return false
  if (type.isUnionOrIntersection()) {
    return type.types.some((member) => isWallMember(scan, member, depth + 1))
  }
  return isDeclaredAsWall(scan, type)
}

function isWallType(scan: Scan, type: ts.Type): boolean {
  return isWallMember(scan, scan.checker.getNonNullableType(type), 0)
}

function endName(name: ts.Node | undefined): string | undefined {
  if (name === undefined) return undefined
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined
}

function isEndName(name: ts.Node | undefined): boolean {
  const text = endName(name)
  return text !== undefined && END_NAMES.includes(text)
}

function accessedExpression(node: ts.Node): ts.Expression | undefined {
  if (ts.isPropertyAccessExpression(node) && isEndName(node.name)) return node.expression
  if (ts.isElementAccessExpression(node) && isEndName(node.argumentExpression)) {
    return node.expression
  }
  return undefined
}

function namesAnEnd(pattern: ts.ObjectBindingPattern): boolean {
  return pattern.elements.some((element) => isEndName(element.propertyName ?? element.name))
}

function readsOfNode(scan: Scan, node: ts.Node): WallEndForm | undefined {
  const accessed = accessedExpression(node)
  if (accessed !== undefined && isWallType(scan, scan.checker.getTypeAtLocation(accessed))) {
    return 'access'
  }
  if (ts.isObjectBindingPattern(node) && namesAnEnd(node)) {
    return isWallType(scan, scan.checker.getTypeAtLocation(node)) ? 'destructuring' : undefined
  }
  return undefined
}

function elementTypeOfList(scan: Scan, type: ts.Type): ts.Type | undefined {
  if (!scan.checker.isArrayType(type)) return undefined
  return scan.checker.getTypeArguments(type as ts.TypeReference)[0]
}

function isWallOrWallList(scan: Scan, type: ts.Type): boolean {
  const element = elementTypeOfList(scan, type)
  return isWallType(scan, element ?? type)
}

function declaredParameterType(
  scan: Scan,
  declaration: ts.SignatureDeclaration,
  index: number,
): ts.Type | undefined {
  const parameter = declaration.parameters[Math.min(index, declaration.parameters.length - 1)]
  if (parameter === undefined) return undefined
  const declared = scan.checker.getNonNullableType(scan.checker.getTypeAtLocation(parameter))
  const constraint = scan.checker.getBaseConstraintOfType(declared)
  return constraint ?? declared
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

function isReadableCallee(scan: Scan, declaration: ts.SignatureDeclaration): boolean {
  const path = repositoryPath(scan, declaration.getSourceFile().fileName)
  return isRepositoryFile(path) && !isInKernel(path)
}

function passesWallToStructuralParameter(
  scan: Scan,
  call: ts.CallExpression | ts.NewExpression,
): boolean {
  const declaration = scan.checker.getResolvedSignature(call)?.getDeclaration()
  if (declaration === undefined || !isReadableCallee(scan, declaration)) return false
  return (call.arguments ?? []).some((argument, index) => {
    const type = scan.checker.getTypeAtLocation(argument)
    if (!isWallOrWallList(scan, type)) return false
    const parameterType = declaredParameterType(scan, declaration, index)
    const passesList = elementTypeOfList(scan, scan.checker.getNonNullableType(type)) !== undefined
    return parameterType !== undefined && isStructuralEndParameter(scan, parameterType, passesList)
  })
}

function formOfNode(scan: Scan, node: ts.Node): WallEndForm | undefined {
  const read = readsOfNode(scan, node)
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
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options })
}
