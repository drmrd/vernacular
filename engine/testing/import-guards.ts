/**
 * Detects whether `source` contains a static VALUE import of `specifier`: a `from
 * '<specifier>'` clause that is not `import type`, or a bare side-effect import
 * (`import '<specifier>'`). Backs the source-reading guard tests that keep a
 * heavy, lazily loaded module (three/webgpu and friends) off the app's startup
 * path; see engine/lighting/sky-environment.test.ts and
 * engine/postprocessing/ambient-occlusion.test.ts for the guards themselves and
 * ADR-0148 for the bundling regression they guard against.
 *
 * `import type` is erased at compile time and a dynamic `import(...)` has no
 * `from` clause, so neither one counts as a static value import: both are the
 * allowed ways to reference a specifier that must stay off the lazy boundary.
 *
 * Known limitation: the static-value match spans the whole source with a lazy
 * `[\s\S]*?`, so it does not anchor per statement. An unrelated static import
 * earlier in the file can still cause a later `import type` of a guarded
 * specifier to be flagged.
 */
export function importsStaticValueOf(source: string, specifier: string): boolean {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const staticValueImport = new RegExp(
    String.raw`import\s+(?!type\b)[\s\S]*?from\s*['"]${escaped}['"]`,
  )
  const bareSideEffectImport = new RegExp(String.raw`import\s+['"]${escaped}['"]`)
  return staticValueImport.test(source) || bareSideEffectImport.test(source)
}
