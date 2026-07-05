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
 * The static-value match stops at the next `import` keyword, so it never
 * crosses into a second import statement. Without that anchor, an unrelated
 * static import earlier in the file could stitch together with an unrelated
 * `from '<specifier>'` several statements later (including one behind its own
 * `import type`), reporting a static import that is not actually there.
 */
export function importsStaticValueOf(source: string, specifier: string): boolean {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const staticValueImport = new RegExp(
    String.raw`import\s+(?!type\b)(?:(?!import)[\s\S])*?from\s*['"]${escaped}['"]`,
  )
  const bareSideEffectImport = new RegExp(String.raw`import\s+['"]${escaped}['"]`)
  return staticValueImport.test(source) || bareSideEffectImport.test(source)
}
