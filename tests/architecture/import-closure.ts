import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { anyModuleSpecifiers, resolveSpecifier } from './import-graph'

const SCOPED_NAME_PARTS = 2

/** What one file reaches by following its relative imports. */
export interface ImportClosure {
  /** Sorted paths of the files reached, the entry included. */
  readonly files: readonly string[]
  /** Sorted package names that those files import: `react/jsx-runtime` counts as `react`. */
  readonly packages: readonly string[]
  /** Sorted `<importer>: <specifier>` of relative imports that no file of `sources` resolves. */
  readonly unresolved: readonly string[]
}

function packageNameOf(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, SCOPED_NAME_PARTS).join('/') : parts[0]!
}

/**
 * Follows every relative import of `entryPath` through `sources` (repository-relative path to
 * source text) and collects the package names that the files reached import.
 *
 * - Followed: imports and re-exports, type-only or not, and a dynamic `import('<string literal>')`.
 *   A package that only a type import names still counts: it is a dependency of the types.
 * - Not seen: a type expression such as `import('...').T`, and the path of a `vi.mock('...')` call.
 * - A relative path that resolves to no file of `sources` (for example a data file) is reported
 *   in `unresolved`, so that a closure that stops short does not pass unnoticed.
 *
 * Throws when `entryPath` is not in `sources`: an empty closure would pass every check.
 */
export function importClosure(
  sources: ReadonlyMap<string, string>,
  entryPath: string,
): ImportClosure {
  if (!sources.has(entryPath)) throw new Error(`The entry ${entryPath} is not in the sources`)
  const reached = new Set([entryPath])
  const packages = new Set<string>()
  const unresolved = new Set<string>()
  const queue = [entryPath]
  for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
    for (const specifier of anyModuleSpecifiers(path, sources.get(path)!)) {
      if (!specifier.startsWith('.')) {
        packages.add(packageNameOf(specifier))
        continue
      }
      const target = resolveSpecifier(path, specifier, sources)
      if (target === undefined) unresolved.add(`${path}: ${specifier}`)
      else if (!reached.has(target)) {
        reached.add(target)
        queue.push(target)
      }
    }
  }
  return {
    files: [...reached].sort(),
    packages: [...packages].sort(),
    unresolved: [...unresolved].sort(),
  }
}

/** The files at `paths` (repository-relative), read from `repositoryRoot`. */
export function readSourceFiles(
  repositoryRoot: string,
  paths: readonly string[],
): Map<string, string> {
  return new Map(paths.map((path) => [path, readFileSync(join(repositoryRoot, path), 'utf8')]))
}
