# Two-Dimensional Plan Export Implementation Plan

> **For agentic workers:** Executed with the project's role-separated red-green-blue cycle (CLAUDE.md, `.claude/rules.md`). Each behavior runs RED (`/test-first` -> `test-author`, commit `test:`), GREEN (`/implement` -> `implementer`, commit `feat:`), then BLUE (`/clean-code-review` then `/refactor`, commit `refactor:` or an empty marker). Tasks marked `(infrastructure)` are controller-authored glue (the `core/index.ts` barrel additions, docs) committed as `build:`/`docs:` or with an `Infrastructure:` trailer so the cycle audit skips them. This plan names each behavior and its public signature; it ships no literal test bodies, because the role-separated `test-author` writes the test from the named behavior, file path, and assertion.

**Goal:** Open the reserved output-and-export seam by adding a new `core/export/` layer with an `Exporter` interface and a deterministic, dependency-free scalable-vector-graphics (SVG) exporter that renders the two-dimensional plan (walls, rooms, openings, dimensions) from the project model and the scene-graph derivation.

**Architecture:** `core/export/` is pure TypeScript that consumes the existing scene-graph derivation (ADR-0018) and the project model, exactly as the design specification (section 6.1, section 6.12) and ADR-0044's output-and-export track call for. The first exporter is an `SvgPlanExporter` that walks `deriveSceneGraph(project)` and emits an SVG document string through a small set of pure element-builder helpers, with one transform that maps world millimeters (y-up) to SVG user units (y-down). It produces an `ExportResult` carrying the bytes-as-string plus a media type. No browser canvas, no React, no Three.js, no new dependency.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest. SVG is generated as plain strings and asserted by parsing structure and attributes, never by brittle whole-document string matches. Stacked on the shipped Phase-1 two-dimensional editor (schema with `Floor.walls`, `Floor.openings`, `Floor.dimensions`; the derived `rooms` projection).

---

## Scope boundary (first slice of the output-and-export track)

This is the first, smallest, independently shippable slice of the output-and-export track in ADR-0044. It opens the `Exporter` seam the design specification reserves (section 2.2) and delivers the first concrete exporter (SVG), chosen because it is pure string generation that needs no new dependency under the 30-day cooldown and is the geometric foundation a later document (PDF) and print path build on.

**In scope (this slice):**

- The `Exporter<Options>` interface and the `ExportResult` / `ExportMediaType` shape in `core/export/exporter.ts`.
- A world-to-SVG view transform and document-bounds computation in `core/export/svg/svg-view.ts` (millimeters, y-up, into SVG user units, y-down, with a configurable margin).
- Pure SVG element-builder helpers (escaping, attribute serialization, `<line>`, `<polygon>`, `<polyline>`, `<text>`, `<g>`, document envelope) in `core/export/svg/svg-document.ts`.
- The `SvgPlanExporter` in `core/export/svg/svg-plan-exporter.ts`, built up over four behavior cycles: walls, then rooms (fill plus labels), then openings, then dimensions.
- Additive re-exports of the new public symbols from the `core/index.ts` barrel (the only shared file this slice touches).

**Out of scope, deferred to later slices (named here so the seam is honored, not reinvented):**

- **Document (PDF) export.** Lands in a later output-and-export slice. PDF likely needs a new dependency (a PDF writer), so it is gated on a dependency decision under the 30-day cooldown (ADR-0010 / rule 5) and a brief ADR; it still lives in `core/export/` behind the same `Exporter` interface, and it composes the SVG geometry decisions this slice settles. See "Decisions and open questions", item 1.
- **Raster (PNG) export.** Lands in a later output-and-export slice. PNG needs a rendering surface (a canvas) to rasterize, which is a browser API and therefore lives outside pure `core/` (rules 1 and 7: `core/` has zero DOM dependencies). It belongs at a thin surface seam outside `core/` (a `bridge/` or `editor/`-side rasterizer that draws the existing plan canvas or an offscreen canvas and reads back PNG bytes), still surfacing through an `Exporter`-shaped result. See "Decisions and open questions", item 2.
- **Standard-format exporters (`ifcJSON`, DXF).** Land in later output-and-export slices behind the same `Exporter` interface, per ADR-0044's interoperability posture (native model stays; standards are additive exporters). The seam this slice defines is exactly what they slot into. See "Decisions and open questions", item 3.
- **Three-dimensional snapshot export and bundle export.** Converge on the three-dimensional preview track and the assets track respectively (ADR-0044 convergence nodes); not part of any two-dimensional export slice.
- **Multi-page document layout, title block, per-floor pages, configurable resolution, paper sizes.** Document-export concerns; deferred with PDF.
- **Underlay raster passthrough into SVG, grid, rulers, snap and selection chrome.** Editor-interaction and raster concerns, not plan deliverables. The exporter renders the printable plan content (walls, rooms, openings, dimensions), not the live-editing overlays. Multi-floor page selection is a document-export concern (the SVG exporter renders the whole derived graph, which today is single-floor in practice).

**Acceptance:** `core/export/` exists with zero React/Three.js/DOM imports; `Exporter` and `ExportResult` are defined and exported from `core/index.ts`; `SvgPlanExporter.export(project)` returns an `ExportResult` whose `media === 'image/svg+xml'` and whose `content` is a well-formed SVG document that, when parsed, contains a wall `<line>` per wall scene node with the expected endpoints, a room `<polygon>` per room with a `<text>` label carrying the room's formatted area (and name when present), an opening element per opening node, and a dimension group per dimension node with its formatted length text; output is deterministic (equal project yields byte-identical SVG) and node ids are carried into `data-node-id` attributes so output is stable and traceable. The full check chain is green (`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`); `eslint .` reports zero problems; `rgb:audit` is clean.

---

## File structure

All paths are under `/Users/dan/workspace/vernacular.wt/two-dimensional-export/`.

- `core/export/exporter.ts` (new) - the `Exporter<Options>` interface, `ExportResult`, `ExportMediaType`. One responsibility: the seam contract.
- `core/export/exporter.test.ts` (new) - tests pinning the seam shape via a tiny in-test fake exporter (the test-author may construct a trivial conforming object; it never imports the SVG exporter).
- `core/export/svg/svg-view.ts` (new) - `planContentBounds`, `SvgView`, `createSvgView`, `worldToSvg`. One responsibility: the world-to-SVG coordinate transform and bounds.
- `core/export/svg/svg-view.test.ts` (new).
- `core/export/svg/svg-document.ts` (new) - pure string builders: `escapeXmlText`, `escapeXmlAttribute`, `svgAttributes`, `svgElement`, `svgLine`, `svgPolygon`, `svgPolyline`, `svgText`, `svgGroup`, `svgDocument`. One responsibility: well-formed SVG string fragments.
- `core/export/svg/svg-document.test.ts` (new).
- `core/export/svg/svg-plan-exporter.ts` (new) - `SvgPlanExporter`, `SvgPlanExportOptions`, the wall/room/opening/dimension rendering functions. One responsibility: project + scene graph -> SVG `ExportResult`.
- `core/export/svg/svg-plan-exporter.test.ts` (new).
- `core/export/index.ts` (new, optional convenience barrel for the layer) - re-exports the layer's public symbols; `core/index.ts` may re-export through it or directly. This plan re-exports directly from `core/index.ts` to match the existing barrel style (each subsystem exported inline), and the layer barrel is omitted unless a later slice needs it.
- `core/index.ts` (MODIFY, additive only) - append the new `core/export/` type and value exports. **This is the only shared file this slice touches; sibling tracks also append here. Keep edits strictly additive (new `export` lines appended), never reorder or remove existing lines.**

**Test conventions (match the existing `core/` suite):** Vitest, `import { describe, expect, it } from 'vitest'`, test files colocated as `<name>.test.ts` next to the unit, behavior-named `it(...)` strings (not method names), `createEmptyProject` / `createFloor` / `createWall` / `createOpening` / `createDimension` from `core/model/factories` for fixtures. SVG assertions parse the string (see the parsing note in Task 3) and assert on structure and attributes, never on a whole-document literal.

---

## Public contract (settled across the slice's cycles)

```ts
// core/export/exporter.ts
/** The IANA media type of an export artifact. Open string union; new exporters extend it. */
export type ExportMediaType = 'image/svg+xml' | 'application/pdf' | 'image/png' | (string & {})

/** A single produced artifact: its media type, a suggested file extension, and the content. */
export interface ExportResult {
  /** IANA media type, e.g. 'image/svg+xml'. */
  media: ExportMediaType
  /** Suggested file extension without the leading dot, e.g. 'svg'. */
  extension: string
  /**
   * The artifact content. Text formats (SVG) carry a UTF-8 string; this slice
   * produces only text. Binary formats (PNG, PDF) are added behind this seam in
   * later slices and will widen `content` to a `Uint8Array` branch then; this
   * slice deliberately ships only the string branch (YAGNI).
   */
  content: string
}

/**
 * Produces an export artifact from a project. Pure read: it never dispatches a
 * command and never mutates the project (rule 3, ADR-0005). Implementations live
 * in `core/export/` and consume the model plus the scene-graph derivation
 * (design specification 6.1, 6.12; ADR-0018, ADR-0044 output-and-export track).
 */
export interface Exporter<Options = void> {
  /** The media type this exporter produces. */
  readonly media: ExportMediaType
  /** Produce the artifact. `options` defaults are the exporter's own concern. */
  export(project: Project, options?: Options): ExportResult
}

// core/export/svg/svg-view.ts
/** Axis-aligned world-space bounds in millimeters. null when there is no content. */
export interface PlanBounds {
  min: Point
  max: Point
}

/**
 * The content bounds of everything the plan SVG draws: wall endpoints, room
 * polygons, opening footprints, and dimension geometry. null for an empty plan.
 */
export function planContentBounds(graph: SceneGraph): PlanBounds | null

/** A world-millimeter (y-up) to SVG-user-unit (y-down) mapping with a margin. */
export interface SvgView {
  /** SVG viewport width in user units (content width + 2 * margin). */
  width: number
  /** SVG viewport height in user units. */
  height: number
  /** Map a world point (mm, y-up) to an SVG point (user units, y-down). */
  project(point: Point): Point
}

export interface SvgViewOptions {
  /** Margin around the content in world millimeters. Default 100. */
  marginMm?: number
}

/** Build the view for the given content bounds. An empty plan yields a minimal margin-only view. */
export function createSvgView(bounds: PlanBounds | null, options?: SvgViewOptions): SvgView

// core/export/svg/svg-document.ts
/** Escape a string for use as XML element text content (& < >). */
export function escapeXmlText(value: string): string
/** Escape a string for use inside a double-quoted XML attribute (& < > "). */
export function escapeXmlAttribute(value: string): string
/** Serialize attributes to a deterministic, space-prefixed attribute string in insertion order. Numbers are rounded to a fixed precision; undefined values are omitted. */
export function svgAttributes(attributes: Record<string, string | number | undefined>): string
/** A self-closing element: `<tag .../>`. */
export function svgElement(
  tag: string,
  attributes: Record<string, string | number | undefined>,
): string
export function svgLine(line: {
  x1: number
  y1: number
  x2: number
  y2: number
  attributes?: Record<string, string | number | undefined>
}): string
/** points are SVG-space points already projected. */
export function svgPolygon(
  points: readonly Point[],
  attributes?: Record<string, string | number | undefined>,
): string
export function svgPolyline(
  points: readonly Point[],
  attributes?: Record<string, string | number | undefined>,
): string
export function svgText(
  text: string,
  position: Point,
  attributes?: Record<string, string | number | undefined>,
): string
/** A group wrapping pre-rendered child fragments. */
export function svgGroup(
  children: readonly string[],
  attributes?: Record<string, string | number | undefined>,
): string
/** The full document envelope with namespace, viewBox '0 0 w h', and width/height. */
export function svgDocument(view: { width: number; height: number }, body: string): string

// core/export/svg/svg-plan-exporter.ts
export interface SvgPlanExportOptions {
  /** Margin around the content in world millimeters. Default 100. */
  marginMm?: number
  /** Unit preferences for area and length text. Default DEFAULT_METRIC_PREFERENCES. */
  preferences?: UnitPreferences
}

/** The pure SVG exporter for the two-dimensional plan. */
export class SvgPlanExporter implements Exporter<SvgPlanExportOptions> {
  readonly media = 'image/svg+xml'
  export(project: Project, options?: SvgPlanExportOptions): ExportResult
}
```

---

## Task 1: The `Exporter` seam (`Exporter`, `ExportResult`, `ExportMediaType`)

**Files:**

- Create: `core/export/exporter.ts`
- Test: `core/export/exporter.test.ts`

This is the first RGB cycle. The behavior is the seam contract itself: a conforming `Exporter` produces an `ExportResult` with a media type, an extension, and content. The test exercises the contract through a tiny in-test fake exporter the `test-author` writes inline (a trivial object literal that conforms to `Exporter`), so the seam is pinned without depending on any concrete exporter.

### THE FIRST RED BEHAVIOR (dispatch this to the `test-author` verbatim)

- [ ] **Step 1: Write the failing test**

**File:** `core/export/exporter.test.ts`
**Test name:** `it('exposes a conforming exporter whose result carries its media type, extension, and content', ...)`
**Behavior:** In the test, declare a minimal object literal typed as `Exporter` (for example one whose `media` is `'image/svg+xml'` and whose `export` returns `{ media: 'image/svg+xml', extension: 'svg', content: '<svg/>' }`), call its `export(project)` with a `createEmptyProject({ name: 'House', units: 'metric', era: 'victorian', appVersion: '0.1.0' })`, and assert the returned `ExportResult`:

- `result.media` equals `'image/svg+xml'` and equals the exporter's own `media` property;
- `result.extension` equals `'svg'`;
- `result.content` equals `'<svg/>'`;
- the exporter's `export` does not mutate the project (assert the project deep-equals a freshly created equivalent project, confirming the pure-read contract).
  The test imports `Exporter`, `ExportResult`, and `ExportMediaType` from `../export/exporter` (relative to the test file: `./exporter`). It must fail to compile/run because `core/export/exporter.ts` does not exist yet.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/export/exporter.test.ts`
Expected: FAIL - module `./exporter` not found (the file does not exist yet).

- [ ] **Step 3: Write the minimal implementation** `(implementer)`

**File:** `core/export/exporter.ts`. Define `ExportMediaType`, `ExportResult`, and `Exporter<Options = void>` exactly as in the public contract above. Import `Project` from `../model/types` and `Point` is not needed here. No runtime code beyond the type and interface declarations is required (these are type-only), so the module exports only types and interfaces.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/export/exporter.test.ts`
Expected: PASS.

- [ ] **Step 5: BLUE - clean-code review then refactor**

Run `/clean-code-review` then `/refactor`. Confirm `core/export/exporter.ts` imports nothing from React, Three.js, or the DOM. Close the cycle with a `refactor:` commit (empty marker if no change).

- [ ] **Step 6: Commit (RED then GREEN then BLUE as three commits)**

The `test-author` lands `test:`, the `implementer` lands `feat:`, the `refactorer` lands `refactor:`. Subjects, for example: `test: pin the core export Exporter seam contract`, `feat: add the core export Exporter and ExportResult seam`, `refactor: tidy the export seam (no change)`.

---

## Task 2: The world-to-SVG view transform and content bounds

**Files:**

- Create: `core/export/svg/svg-view.ts`
- Test: `core/export/svg/svg-view.test.ts`

**Why:** SVG user space is y-down; the project model is y-up (millimeters). Every drawn element needs the same transform, and the document needs content bounds plus a margin to size the viewBox. This factors the one coordinate decision out of the exporter so each render function stays trivial.

- [ ] **Step 1: Write the failing tests** `(test-author)`

**File:** `core/export/svg/svg-view.test.ts`. Behaviors:

1. `it('bounds a plan from its wall, room, opening, and dimension geometry')`: build a project with one floor containing two walls forming a corner (for example `(0,0)->(4000,0)` and `(4000,0)->(4000,3000)`), derive the graph with `deriveSceneGraph(project)`, call `planContentBounds(graph)`, and assert `min` and `max` enclose every wall endpoint (here `min === {x:0,y:0}`, `max === {x:4000,y:3000}`). Use `expect(...).toEqual(...)`.
2. `it('returns null content bounds for an empty plan')`: a project with one empty floor (no walls/openings/dimensions, so no rooms) yields `planContentBounds(graph) === null`.
3. `it('maps world y-up millimeters to SVG y-down user units within a margin')`: with bounds `min {x:0,y:0}` max `{x:4000,y:3000}` and `createSvgView(bounds, { marginMm: 100 })`, assert `view.width === 4200` and `view.height === 3200`; assert `view.project({ x: 0, y: 3000 })` equals `{ x: 100, y: 100 }` (top-left of content after the y flip) and `view.project({ x: 0, y: 0 })` equals `{ x: 100, y: 3100 }` (bottom-left). Assert the y axis is flipped: a larger world y maps to a smaller SVG y.
4. `it('builds a minimal margin-only view for null bounds')`: `createSvgView(null)` yields a positive `width` and `height` (twice the default margin) and a `project` that is callable without throwing.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run core/export/svg/svg-view.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Minimal implementation** `(implementer)`

**File:** `core/export/svg/svg-view.ts`.

- `planContentBounds(graph)`: collect all points from `graph.walls` (`start`, `end`), `graph.rooms` (`polygon`), `graph.openings` (use `openingFootprint(center, along, normal, width, hostThickness)` corners, imported from `../../topology/openings`), and `graph.dimensions` (`start`, `end`, and the offset dimension line endpoints via `dimensionGeometry(start, end, offset)` from `../../geometry/dimension`). Reduce to min/max; return `null` when there are no points.
- `createSvgView(bounds, options)`: `marginMm` default `100`. For null bounds, return `width = height = 2 * marginMm` and an identity-ish `project` that shifts by the margin. For real bounds, `width = (max.x - min.x) + 2*margin`, `height = (max.y - min.y) + 2*margin`, and `project(p) = { x: (p.x - min.x) + margin, y: (max.y - p.y) + margin }` (the `max.y - p.y` term performs the y flip).
- Define `MARGIN_MM_DEFAULT = 100` as a module constant (avoids the `no-magic-numbers` lint).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run core/export/svg/svg-view.test.ts`
Expected: PASS.

- [ ] **Step 5: BLUE**

`/clean-code-review` then `/refactor`. Watch `max-lines-per-function` (40) on `planContentBounds`: if it crowds the limit, factor a `pointsFromGraph(graph): Point[]` helper. Confirm no DOM/React/Three.js imports. Close with `refactor:`.

- [ ] **Step 6: Commit**

`test: ...`, `feat: add the SVG plan view transform and content bounds`, `refactor: ...`.

---

## Task 3: Pure SVG string builders

**Files:**

- Create: `core/export/svg/svg-document.ts`
- Test: `core/export/svg/svg-document.test.ts`

**Why:** Every render function emits SVG fragments; centralizing escaping, deterministic attribute serialization, and the document envelope keeps the exporter free of string fiddling and guarantees well-formed, deterministic output.

**Parsing note for assertions (applies to this task and Tasks 4-7):** assert on structure and attributes, never on a whole-document literal. The `test-author` parses fragments with the platform `DOMParser` available in the Vitest jsdom-free environment is NOT guaranteed in `core/` unit runs, so prefer a dependency-free structural assertion: either (a) parse with `new DOMParser().parseFromString(svg, 'image/svg+xml')` only if the test file opts into the jsdom environment via a `// @vitest-environment jsdom` pragma at the top of that one test file, or (b) assert with targeted regular expressions and substring checks on attributes and tag presence (for example, that the string contains exactly one `<line ` per wall and that a wall's `x1`/`y1`/`x2`/`y2` attributes carry the projected endpoints). This plan recommends approach (b) for the document-builder unit tests (no environment pragma needed) and lets the exporter tests in Task 4-7 use approach (a) with the `jsdom` pragma when counting elements is clearer via the parsed DOM. Both are deterministic and structural.

- [ ] **Step 1: Write the failing tests** `(test-author)`

**File:** `core/export/svg/svg-document.test.ts`. Behaviors:

1. `it('escapes XML text special characters')`: `escapeXmlText('Tom & "Jerry" <b>')` replaces `&` `<` `>` (leaving quotes as-is for text content) so the result contains `&amp;` and `&lt;` and `&gt;` and no raw `<`/`>`/`&`.
2. `it('escapes attribute values including quotes')`: `escapeXmlAttribute('a & "b" <c>')` contains `&amp;`, `&quot;`, `&lt;`, `&gt;`.
3. `it('serializes attributes deterministically in insertion order and rounds numbers')`: `svgAttributes({ x1: 1.23456, y1: 2, stroke: '#222' })` yields `' x1="1.235" y1="2" stroke="#222"'` (fixed precision of 3 decimals, trailing-zero-trimmed; leading space; insertion order preserved) and omits keys whose value is `undefined`.
4. `it('emits a self-closing line element with its endpoints and attributes')`: `svgLine({ x1: 0, y1: 0, x2: 10, y2: 5, attributes: { stroke: '#222' } })` matches `/^<line [^>]*\/>$/` and contains `x1="0"`, `y1="0"`, `x2="10"`, `y2="5"`, `stroke="#222"`.
5. `it('emits a polygon with a points attribute from projected points')`: `svgPolygon([{x:0,y:0},{x:10,y:0},{x:10,y:10}], { fill: '#eef2f6' })` contains `points="0,0 10,0 10,10"` and `fill="#eef2f6"`.
6. `it('emits a polyline with a points attribute')`: analogous to polygon but tag is `<polyline`.
7. `it('emits a text element with escaped content at a position')`: `svgText('Kitchen & Bath', { x: 5, y: 6 })` contains `x="5"`, `y="6"`, and the escaped body `>Kitchen &amp; Bath<`.
8. `it('wraps children in a group')`: `svgGroup(['<line/>', '<line/>'], { 'data-node-id': 'wall:w1' })` starts with `<g ` carrying `data-node-id="wall:w1"`, contains both children, and ends with `</g>`.
9. `it('wraps a body in a namespaced svg document with a viewBox')`: `svgDocument({ width: 4200, height: 3200 }, '<g/>')` starts with `<?xml` or `<svg`, contains `xmlns="http://www.w3.org/2000/svg"`, `viewBox="0 0 4200 3200"`, `width="4200"`, `height="3200"`, the body `<g/>`, and ends with `</svg>`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run core/export/svg/svg-document.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Minimal implementation** `(implementer)`

**File:** `core/export/svg/svg-document.ts`. Implement each builder per the public contract. Key points:

- Escaping: replace `&` first, then `<`, `>` (and `"` for attributes). Define the replacements as a small ordered list.
- `svgAttributes`: round numbers with a `roundCoordinate(value)` helper to 3 decimal places and strip trailing zeros (reuse the project's `roundToDecimalPlaces` from `../../units` if its signature fits, otherwise a local `Number(value.toFixed(3))`); join `key="escapedValue"` pairs with a leading space each; skip `undefined`.
- `svgPolygon` / `svgPolyline`: build `points` as `x,y` pairs space-joined, each coordinate rounded.
- `svgDocument`: emit `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="..." viewBox="0 0 W H" width="W" height="H">BODY</svg>`.
- Define magic numbers (`COORDINATE_PRECISION = 3`) as module constants.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run core/export/svg/svg-document.test.ts`
Expected: PASS.

- [ ] **Step 5: BLUE**

`/clean-code-review` then `/refactor`. Watch `max-lines` (300) for the module and `no-magic-numbers`. If the escaping logic duplicates between text and attribute, factor a shared `escapeWith(replacements)`. Close with `refactor:`.

- [ ] **Step 6: Commit**

`test: ...`, `feat: add pure SVG string builders for the plan exporter`, `refactor: ...`.

---

## Task 4: `SvgPlanExporter` emitting walls

**Files:**

- Create: `core/export/svg/svg-plan-exporter.ts`
- Test: `core/export/svg/svg-plan-exporter.test.ts`

**Why:** The first concrete behavior of the exporter: produce a valid SVG document whose body contains one wall `<line>` per wall scene node, projected through the view, carrying a `data-node-id`. This is the smallest end-to-end exporter that returns a real `ExportResult`.

- [ ] **Step 1: Write the failing tests** `(test-author)`

**File:** `core/export/svg/svg-plan-exporter.test.ts` (may use `// @vitest-environment jsdom` at the top so the test can parse with `DOMParser` and count elements). Behaviors:

1. `it('returns an SVG export result with the svg media type and extension')`: build a project with one floor and one wall `(0,0)->(4000,0)`, call `new SvgPlanExporter().export(project)`, assert `result.media === 'image/svg+xml'`, `result.extension === 'svg'`, and `result.content` starts with the SVG/XML envelope and ends with `</svg>`.
2. `it('emits one line per wall with projected endpoints and the wall node id')`: with two walls, parse `result.content` and assert there are exactly two `<line>` elements; for the wall `(0,0)->(4000,0)` with default margin 100 and bounds derived from the geometry, assert the corresponding `<line>` has the projected `x1/y1/x2/y2` (compute the expected via the same `createSvgView` math, or assert the two endpoints are distinct and finite and that the element's `data-node-id` equals the wall scene node id `wall:<id>`). Assert each `<line>` carries `data-node-id` starting with `wall:`.
3. `it('is deterministic: equal projects yield byte-identical SVG')`: export the same project twice (two freshly built equivalent projects) and assert the two `content` strings are strictly equal.
4. `it('does not mutate the project')`: assert the project deep-equals a freshly built equivalent after `export`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run core/export/svg/svg-plan-exporter.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Minimal implementation** `(implementer)`

**File:** `core/export/svg/svg-plan-exporter.ts`. Implement `SvgPlanExporter` with `media = 'image/svg+xml'` and `export(project, options)`:

- `const graph = deriveSceneGraph(project)` (from `../../scene/scene-graph`).
- `const bounds = planContentBounds(graph)`; `const view = createSvgView(bounds, { marginMm: options?.marginMm })`.
- `renderWalls(graph, view)`: for each `wall` in `graph.walls`, project `start` and `end`, emit `svgLine({ x1, y1, x2, y2, attributes: { stroke: WALL_INK, 'stroke-width': wall.thickness, 'stroke-linecap': 'round', 'data-node-id': wall.id } })`. Wrap the wall lines in `svgGroup(lines, { 'data-layer': 'walls' })`.
- `const body = svgGroup([wallsGroup], {})` (the body grows in later tasks).
- `return { media: 'image/svg+xml', extension: 'svg', content: svgDocument(view, body) }`.
- Module constants for colors mirror the editor reference values (`WALL_INK = '#222222'`) so the exported plan reads like the on-screen plan; do not import any editor code (that would cross the `core/` boundary into `editor/`). The constants are redeclared in `core/`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run core/export/svg/svg-plan-exporter.test.ts`
Expected: PASS.

- [ ] **Step 5: BLUE**

`/clean-code-review` then `/refactor`. Keep `export` small by delegating to per-layer `renderWalls(...)` functions (newspaper style: `export` at top, helpers below). Watch `max-lines-per-function` (40). Confirm no `editor/`, DOM, React, or Three.js imports. Close with `refactor:`.

- [ ] **Step 6: Commit**

`test: ...`, `feat: add the SVG plan exporter emitting walls`, `refactor: ...`.

---

## Task 5: Rooms (fill polygons plus name and area labels)

**Files:**

- Modify: `core/export/svg/svg-plan-exporter.ts`
- Test: `core/export/svg/svg-plan-exporter.test.ts` (add cases)

**Why:** Rooms are the derived floor fill and the labeled identity of the plan. The exporter paints each room polygon and writes its area (and name when present) at the centroid, mirroring the on-screen room label.

- [ ] **Step 1: Write the failing tests** `(test-author)`

Add to `core/export/svg/svg-plan-exporter.test.ts`:

1. `it('emits a filled polygon per derived room carrying the room node id')`: build a single rectangular room from four walls (for example `(0,0)-(4000,0)-(4000,3000)-(0,3000)` closed), export, parse, and assert there is one `<polygon>` whose `data-node-id` equals the room scene node id (the `room:` prefixed id). Assert it carries a non-empty `fill`.
2. `it('labels each room with its formatted area at the centroid')`: for the same room, assert there is a `<text>` element whose text content equals `formatArea(room.area, DEFAULT_METRIC_PREFERENCES)` for the derived room (the test computes the expected from `deriveSceneGraph` + `formatArea`, both from `../../`), positioned at the projected `polygonCentroid(room.polygon)`.
3. `it('includes the room name above the area when the room has a name override')`: set a room name via a `roomOverrides` entry keyed by `roomKey(room)` (use the `setRoomName` command through a `Dispatcher`, or set `project.roomOverrides` directly in the fixture since export is a pure read), export, and assert a `<text>` contains the name and a separate `<text>` (or `<tspan>`) contains the area. The exporter renders name and area as two text lines like the on-screen label.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run core/export/svg/svg-plan-exporter.test.ts`
Expected: FAIL - rooms not yet rendered (no `<polygon>`/`<text>`).

- [ ] **Step 3: Minimal implementation** `(implementer)`

In `core/export/svg/svg-plan-exporter.ts` add `renderRooms(graph, view, preferences)`:

- For each `room` in `graph.rooms`: project each `polygon` point; emit `svgPolygon(projectedPoints, { fill: ROOM_FILL, 'data-node-id': room.id })`.
- Label: compute `anchor = view.project(polygonCentroid(room.polygon))` (`polygonCentroid` from `../../geometry/polygon`); the area text is `formatArea(room.area, preferences)` (`formatArea` from `../../units`). When `room.name !== undefined`, emit a name `<text>` at `anchor` and an area `<text>` at `{ x: anchor.x, y: anchor.y + LABEL_LINE_HEIGHT }`; otherwise emit only the area `<text>` at `anchor`. Use `text-anchor="middle"` and a font attribute group, mirroring the editor label (`LABEL_INK = '#37414d'`, `LABEL_FONT_SIZE`, `LABEL_LINE_HEIGHT`).
- `preferences = options?.preferences ?? DEFAULT_METRIC_PREFERENCES` (from `../../units`).
- Insert the rooms group into the body BEFORE the walls group so wall strokes render over the fill (matches `drawPlan` order: rooms fill first, walls on top, labels above). Body becomes `svgGroup([roomsGroup, wallsGroup, roomLabelsGroup], {})`, with room labels as their own group painted last so text reads on top.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run core/export/svg/svg-plan-exporter.test.ts`
Expected: PASS.

- [ ] **Step 5: BLUE**

`/clean-code-review` then `/refactor`. `renderRooms` plus label logic will press `max-lines-per-function` (40) and `max-params` (3): bundle the painter collaborators (`view`, `preferences`) into a small `SvgPlanContext` object passed to each `render*` function, mirroring the editor's `DimensionPainter`/`OpeningPainter` bundling pattern. Factor `renderRoomLabel(room, context)`. Close with `refactor:`.

- [ ] **Step 6: Commit**

`test: ...`, `feat: render room fills and labels in the SVG plan export`, `refactor: ...`.

---

## Task 6: Openings

**Files:**

- Modify: `core/export/svg/svg-plan-exporter.ts`
- Test: `core/export/svg/svg-plan-exporter.test.ts` (add cases)

**Why:** Openings break the wall stroke and carry the door/window symbol. The exporter emits, per opening, a gap polygon (so the wall reads as broken), the two jamb caps, and a simple family glyph. To keep this slice pure and dependency-free, the exporter draws the geometric primitives the scene node already provides; it reuses the existing pure `openingFootprint` helper from `core/topology/openings`. The full family-symbol fidelity (swing arcs, slide tracks, crank ticks) is settled here as straight-line and polyline glyphs; arcs are approximated by a leaf line plus a chord (an SVG `<path>` arc can be added in a refinement, see open question 4).

- [ ] **Step 1: Write the failing tests** `(test-author)`

Add to `core/export/svg/svg-plan-exporter.test.ts`:

1. `it('emits an opening element group per opening carrying the opening node id')`: build a wall with one door opening (via `createOpening` and `placeOpening`/direct fixture), export, parse, assert there is exactly one group (or element) whose `data-node-id` equals the opening scene node id (`opening:<id>`).
2. `it('breaks the host wall with an opening gap polygon')`: assert the opening group contains a `<polygon>` whose points equal the projected `openingFootprint(node.center, node.along, node.normal, node.width, node.hostThickness)` corners, filled with the gap color (`#ffffff`).
3. `it('draws a jamb cap at each opening jamb')`: assert the opening group contains two `<line>` jamb caps (the across-wall segments at each jamb), or a single `<polyline>` covering both, with the opening ink stroke.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run core/export/svg/svg-plan-exporter.test.ts`
Expected: FAIL - openings not yet rendered.

- [ ] **Step 3: Minimal implementation** `(implementer)`

In `core/export/svg/svg-plan-exporter.ts` add `renderOpenings(graph, context)`:

- For each `opening` in `graph.openings`: compute `corners = openingFootprint(opening.center, opening.along, opening.normal, opening.width, opening.hostThickness)` (from `../../topology/openings`); project them; emit a gap `svgPolygon(projectedCorners, { fill: OPENING_GAP, stroke: 'none' })`.
- Jamb caps: compute the two jamb points (`center +/- along * width/2`, mirroring `hingeJamb`/`otherJamb` in the editor reference using pure vector math on `opening.center`, `opening.along`, `opening.normal`, `opening.width`, `opening.hostThickness`) and emit an across-wall `<line>` at each (`jamb +/- normal * hostThickness/2`), stroked with `OPENING_INK = '#222222'`.
- A minimal family glyph: emit a leaf `<line>` from the hinge jamb along the normal by the opening width and a chord `<line>` back to the other jamb (a recognizable swing indication) for door families; for window families emit the two frame lines plus a glazing line (mirroring `drawWindowFrame`). Keep the glyph logic in a small `openingGlyph(opening, context): string[]` switch on a coarse family derived from the node `type` prefix, or render only the gap-plus-jamb baseline this slice and defer per-family glyphs (see open question 4). This plan ships the gap-plus-jamb baseline plus a single swing leaf line for all doors and the frame-plus-glazing lines for all windows, classified by reading the element-type registry category is NOT available in `core/` without the registry; instead classify by a coarse heuristic on `opening.type` string (for example `startsWith('window')` vs default door). Record the heuristic limitation in the BLUE notes.
- Wrap each opening's fragments in `svgGroup(fragments, { 'data-node-id': opening.id })`; collect into an openings group inserted into the body AFTER walls (openings paint over the wall, matching `drawPlan`).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run core/export/svg/svg-plan-exporter.test.ts`
Expected: PASS.

- [ ] **Step 5: BLUE**

`/clean-code-review` then `/refactor`. The glyph switch will press complexity and `max-lines-per-function`; factor `openingGap`, `openingJambs`, `openingGlyph` helpers. Confirm the family heuristic is documented with a WHY comment (registry-driven classification is deferred because the element-type registry category lookup is an editor/bridge concern, and adding it here would broaden the slice). Close with `refactor:`.

- [ ] **Step 6: Commit**

`test: ...`, `feat: render openings in the SVG plan export`, `refactor: ...`.

---

## Task 7: Dimensions

**Files:**

- Modify: `core/export/svg/svg-plan-exporter.ts`
- Test: `core/export/svg/svg-plan-exporter.test.ts` (add cases)

**Why:** Dimensions are the measured-length annotations a renovator needs on a printed plan. The exporter emits, per dimension, the offset dimension line, the two extension lines, an arrowhead at each end, and the formatted length text at the midpoint, reusing the pure `dimensionGeometry` and `formatLength` helpers that already drive the on-screen dimension.

- [ ] **Step 1: Write the failing tests** `(test-author)`

Add to `core/export/svg/svg-plan-exporter.test.ts`:

1. `it('emits a dimension group per dimension carrying the dimension node id')`: build a project with one dimension `(0,0)->(4000,0)` offset `300`, export, parse, assert exactly one group with `data-node-id` equal to the dimension scene node id (`dimension:<id>`).
2. `it('draws the offset dimension line and two extension lines')`: assert the dimension group contains the projected dimension line (from `dimensionGeometry(start, end, offset).lineStart/lineEnd`) and the two extension `<line>`s (from `extensionStart`/`extensionEnd`), all using the dimension ink color.
3. `it('labels the dimension with its formatted length at the line midpoint')`: assert a `<text>` whose content equals `formatLength(node.length, lengthFormatOptions(DEFAULT_METRIC_PREFERENCES))` positioned at the projected midpoint of the dimension line. The test computes the expected length text from `deriveSceneGraph` + `formatLength` + `lengthFormatOptions` (all from `../../`).
4. `it('draws an arrowhead at each end of the dimension line')`: assert the group contains arrowhead geometry (two short `<line>`s or a `<polyline>` per end); a structural count of at least the line+extensions+arrowheads is sufficient (assert the group contains at least 6 `<line>` elements: dimension line + 2 extensions + 2 arrowhead barbs per end is 1 + 2 + 4 = 7, or assert >= the count the implementation produces; prefer asserting the presence of arrowhead `<line>`s distinct from the main line by count).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run core/export/svg/svg-plan-exporter.test.ts`
Expected: FAIL - dimensions not yet rendered.

- [ ] **Step 3: Minimal implementation** `(implementer)`

In `core/export/svg/svg-plan-exporter.ts` add `renderDimensions(graph, context)`:

- For each `dimension` in `graph.dimensions`: `const geom = dimensionGeometry(dimension.start, dimension.end, dimension.offset)` (from `../../geometry/dimension`). Project `geom.lineStart`/`geom.lineEnd` and the extension endpoints. Emit the dimension `<line>`, the two extension `<line>`s, with `DIMENSION_INK = '#222222'`.
- Arrowheads: at each end, compute the unit direction in SVG space and two barbs rotated by `+/- ARROWHEAD_HALF_ANGLE` (mirror the editor's `strokeArrowhead`: `ARROWHEAD_LENGTH_PX` and `Math.PI / 8` constants), emit two short `<line>`s per end. Because the SVG is in world-millimeter user units (not screen pixels), express the arrowhead length in millimeters (`ARROWHEAD_LENGTH_MM`, a module constant such as `120`) so it scales with the plan rather than depending on a viewport.
- Length text: `formatLength(dimension.length, lengthFormatOptions(preferences))` (from `../../units`) at the projected midpoint of the dimension line, `text-anchor="middle"`, `LABEL_INK`.
- Wrap in `svgGroup(fragments, { 'data-node-id': dimension.id })`; collect into a dimensions group inserted into the body LAST (dimensions are annotation overlays above the plan, matching `drawPlan`).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run core/export/svg/svg-plan-exporter.test.ts`
Expected: PASS.

- [ ] **Step 5: BLUE**

`/clean-code-review` then `/refactor`. The arrowhead math will press complexity; factor `dimensionArrowheads(geom, context)` and a shared `svgLineWorld(context, from, to, attributes)` that projects then calls `svgLine`, which all four render layers can use to shrink themselves. Close with `refactor:`.

- [ ] **Step 6: Commit**

`test: ...`, `feat: render dimensions in the SVG plan export`, `refactor: ...`.

---

## Task 8: Public surface - export the seam and the SVG exporter from `core/index.ts` (infrastructure)

**Files:**

- Modify: `core/index.ts` (additive only; SHARED FILE)

**Why:** Downstream layers (`bridge/`, `editor/`) import core symbols only through the `core/index.ts` barrel. This slice's public surface is the `Exporter` seam and the `SvgPlanExporter`. This is controller-authored glue, committed as `build:` or with an `Infrastructure:` trailer so the RGB audit skips it.

- [ ] **Step 1: Append the new exports**

At the END of `core/index.ts` (append only; do not reorder or remove existing lines), add:

```ts
export type { ExportMediaType, ExportResult, Exporter } from './export/exporter'
export type { PlanBounds, SvgView, SvgViewOptions } from './export/svg/svg-view'
export { createSvgView, planContentBounds } from './export/svg/svg-view'
export type { SvgPlanExportOptions } from './export/svg/svg-plan-exporter'
export { SvgPlanExporter } from './export/svg/svg-plan-exporter'
```

The pure SVG string builders in `core/export/svg/svg-document.ts` are an internal detail of the exporter and are intentionally NOT re-exported from the barrel (Interface Segregation: callers want the exporter, not the string primitives).

- [ ] **Step 2: Verify the public surface compiles and the full suite is green**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`
Expected: all green; `eslint .` zero problems.

- [ ] **Step 3: Commit**

`build: export the core export seam and SVG plan exporter from the barrel` (or include an `Infrastructure:` trailer). Because this is glue, no test/feat/refactor triple is required and the `rgb:audit` skips it.

---

## Final verification

- [ ] Run the full check chain: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`. Expected: all green.
- [ ] Run `eslint .` and confirm zero problems (warnings count: `max-lines-per-function` 40, `max-lines` 300, `max-params` 3, `no-magic-numbers`, `no-nested-ternary`).
- [ ] Run `rgb:audit` (default range `origin/main..HEAD`) and confirm each behavior cycle reads `test:` -> `feat:` -> `refactor:`, with Task 8 exempt as `build:`/`Infrastructure:`.
- [ ] Confirm `core/export/` imports nothing from React, Three.js, the DOM, or `editor/` (grep the new files for `react`, `three`, `document`, `window`, `canvas`, `../../editor`).
- [ ] Confirm determinism: a focused test exports an equivalent project twice and asserts byte-identical SVG.

---

## Decisions and open questions

1. **Document (PDF) export is deferred and gated on a dependency decision.** A faithful multi-page PDF with a title block needs a PDF-writing dependency, which is subject to the 30-day cooldown (ADR-0010, rule 5) and warrants a short ADR recording the choice. It lands in a later output-and-export slice, still in `core/export/` behind the `Exporter` interface, composing this slice's SVG geometry. Best-practice default taken now: keep `ExportResult.content` a `string` for the text-only SVG case and widen it to a `Uint8Array` branch when the first binary exporter (PNG or PDF) lands, rather than speculatively modeling binary content now (YAGNI).

2. **Raster (PNG) export is deferred and lives outside pure `core/`.** PNG requires a canvas to rasterize, a browser API barred from `core/` (rules 1 and 7). It belongs at a thin surface seam in `bridge/` or `editor/` that draws the existing plan canvas (or an offscreen canvas) and reads back PNG bytes, surfacing an `Exporter`-shaped result. One viable path is to render this slice's SVG into an image and draw it to a canvas, so the SVG exporter is the upstream of the PNG path. Named here so the later slice reuses, not reinvents, the seam.

3. **Standard-format exporters (`ifcJSON`, DXF) are deferred behind the same interface.** Per ADR-0044's interoperability posture, the native model stays and standards are additive exporters. They slot into the `Exporter` seam this slice defines; `ifcJSON` is the one ADR-0044 calls out to prove interoperability within the output track.

4. **Opening family-symbol fidelity is intentionally coarse in this slice.** The on-screen renderer classifies openings by the element-type registry category and `plan2D.symbol` family and draws swing arcs, slide tracks, fold zigzags, crank ticks, etc. The registry-category lookup is an editor/bridge concern; wiring it into `core/export/` would broaden this slice. Best-practice default: the exporter draws the gap, the jamb caps, and a coarse glyph (a swing leaf line for doors, frame-plus-glazing lines for windows) classified by a simple heuristic on the `opening.type` string, and the registry-driven, arc-accurate family symbols are a later refinement. This keeps the first slice small, pure, and dependency-free while still producing a readable, broken-wall opening. Recorded so the refinement is a known follow-up, not a regression.

5. **Coordinate system: SVG user units ARE world millimeters (with a margin), not screen pixels.** The on-screen renderer projects world to screen through the interactive viewport (pan/zoom). Export has no viewport; the natural, deterministic choice is one SVG user unit per millimeter, with only a y-flip and a margin offset. This makes the SVG intrinsically dimensioned (a downstream consumer can scale to any paper size) and keeps `planContentBounds` + `createSvgView` the single transform. The arrowhead and label sizing are therefore expressed in millimeters, not pixels.

6. **Colors and label styling are redeclared in `core/`, not imported from `editor/`.** The exported plan mirrors the on-screen ink and fill values (`#222222` walls, `#eef2f6` room fill, `#37414d` labels) so it reads like the screen, but importing them from `editor/` would violate the layer boundary (`core/` must not depend on `editor/`). The constants are redeclared as module constants in the exporter. If the duplication later matters, the shared palette would be promoted into a small `core/` styling-tokens module in a dedicated slice (out of scope here; DRY is not worth a premature abstraction for six color literals).

7. **No `Importer` work in this slice.** ADR-0044 reserves `core/import/` symmetrically, but the first output-and-export slice is export-only; the `Importer` seam lands when the first importer (a standard-format reader) is scheduled. Named so the symmetry is intentional, not forgotten.

## Shared-file coordination risk

The only shared file this slice modifies is `core/index.ts` (Task 8), which sibling tracks (three-dimensional preview, assets and furniture, old-house vocabulary, etc.) also append to. The edit is strictly additive (new `export` lines appended at the end). If a sibling slice merges first and also appended, a rebase may surface a trivial both-added conflict at the tail of the file; resolve by keeping both blocks (this is the merge-parallel-worktree-slices hazard from project memory). No other file in this slice is shared; everything else is new under `core/export/`.
