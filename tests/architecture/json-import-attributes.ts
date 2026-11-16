import ts from 'typescript'

const JSON_SPECIFIER_PATTERN = /\.json$/
const CORE_PATH_PREFIX = 'core/'

function isTypeOnlyClause(clause: ts.ImportClause): boolean {
  if (clause.isTypeOnly) return true
  const bindings = clause.namedBindings
  const hasDefault = clause.name !== undefined
  if (hasDefault || bindings === undefined || !ts.isNamedImports(bindings)) return false
  return bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly)
}

function declaresJsonType(declaration: ts.ImportDeclaration): boolean {
  const attributes = declaration.attributes?.elements ?? []
  return attributes.some(
    (attribute) =>
      attribute.name.getText() === 'type' &&
      ts.isStringLiteral(attribute.value) &&
      attribute.value.text === 'json',
  )
}

function isJsonImportMissingAttribute(statement: ts.Statement): statement is ts.ImportDeclaration {
  if (!ts.isImportDeclaration(statement)) return false
  if (!ts.isStringLiteral(statement.moduleSpecifier)) return false
  if (!JSON_SPECIFIER_PATTERN.test(statement.moduleSpecifier.text)) return false
  const clause = statement.importClause
  if (clause !== undefined && isTypeOnlyClause(clause)) return false
  return !declaresJsonType(statement)
}

/**
 * Specifiers of the `.json` imports in a file under `core/` that lack the `with { type: 'json' }`
 * attribute. Files outside `core/` and type-only imports are never reported.
 */
export function findJsonImportsWithoutAttribute(path: string, text: string): string[] {
  if (!path.startsWith(CORE_PATH_PREFIX)) return []
  const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  return sourceFile.statements
    .filter(isJsonImportMissingAttribute)
    .map((declaration) => (declaration.moduleSpecifier as ts.StringLiteral).text)
}
