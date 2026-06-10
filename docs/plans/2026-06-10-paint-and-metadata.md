# Paint and Metadata Implementation Plan

> **For agentic workers:** This plan is executed with the project's red-green-blue (RGB) TDD discipline, one behavior per cycle. The orchestrator dispatches the role-separated subagents from the main thread: `/test-first` (test-author, RED), `/implement` (implementer, GREEN), `/clean-code-review` then `/refactor` (BLUE). Each cycle closes with a `refactor:` commit, possibly empty (see `.claude/rules.md` rule 14 and the rgb:audit commit-sequence rules). The test-author and implementer never share files; both read this plan as the shared behavior specification, so the public API surface and example tables below are the contract that keeps them converging. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the paint-and-metadata track's model, registry, and two-dimensional-side surfaces: pure-`core/` OKLab color math; a project-local palette model and a `PaletteRegistry` (color names in three color forms); a surface-by-surface paint-assignment model (a color plus a finish, per wall face, floor, or ceiling) driven entirely through `dispatch(command)` with a framework-captured inverse; an OKLab-aware color picker and a finish picker built on the design-system primitives; and a site-metadata surface (lat/long, north bearing, top-down obstruction massing) with an editor to author it. The live painted three-dimensional preview is explicitly deferred behind the three-dimensional render seam (see the non-goal below).

**Relationship to the design specification (read before starting):** Section 7.4 (color science) requires OKLab as the canonical internal representation with sRGB hex for display and serialization and an `originalSpec` source identifier, and requires every paint chip to carry an accessible color name. Section 6.8 (materials and paint preview) describes the `PaintMaterial` that consumes a base color plus a `FinishRegistry` finish; that shader lives in `engine/` and is currently a harness stub (ADR-0045), so its consumption of the model is out of scope here. Section 3.1 places `palettes[]` as a project-local array and `site` (optional: `latLong`, `northBearing`, `obstructions[]`) on the project. Section 4.4 lists the `FinishRegistry` (already shipped) and the `PaletteRegistry` (this plan). This track is the "Paint and metadata" delivery track of ADR-0044: "The surface-by-surface paint assignment model, the palette registry and the color and finish pickers, and the site-metadata surface. The model, registry, and picker infrastructure are independent; the painted preview converges on the three-dimensional preview track's paint material."

**Architecture:** All color math, the palette and paint-assignment models, the registry, the site model, and every command are pure TypeScript in `core/` (rule 1: `core/` imports neither React nor Three.js). Color is centralized in a new `core/color/` module (design spec 6.8: "Color science is centralized in `core/color/`"). The `PaletteRegistry` mirrors the existing `core/registries/finishes.ts` shape and the generic `core/registries/registry.ts` (ADR-0006). Project-local palettes and surface paint assignments are additive top-level fields on `Project`, reassigned whole by undoable commands so the inverse-capture proxy records the root-level change, exactly as `roomOverrides` already does (`core/commands/handlers/room-commands.ts`). A surface is addressed by a stable, derivation-independent `SurfaceRef` (an entity id plus a surface-kind discriminator) because the scene graph does not yet model wall faces, floor surfaces, or ceilings as first-class nodes. The site model is a new optional top-level `Project.site`. The renamed/added persisted shape rides one schema migration. The pickers and the site editor are React components in `editor/`, built on the design-system `Button`, `Stack`, and tokens, taking a `dispatch` prop and emitting the core commands, mirroring `editor/plan/room-name-editor.tsx`.

**Tech Stack:** TypeScript, Vitest, `@testing-library/react` and `@testing-library/user-event` for the editor components, the existing `core/registries/registry.ts` generic registry, the existing `Dispatcher`/`CommandRegistry`, the existing schema-migration chain in `core/migrations/`, and the existing `editor/design-system/` primitives. No new runtime or dev dependencies (the dependency cooldown and exact-pin rules forbid adding any; the OKLab conversions are implemented from the published matrices, not a library).

---

## Scope and boundaries

### In scope (this track)

1. **OKLab color math (`core/color/`)**, pure TypeScript: the `OkLab` and `LinearRgb`/`Srgb` value types; sRGB-hex parse and format; sRGB to and from OKLab conversion (through linear sRGB with correct gamma); and the perceptual operations the spec names: mix (interpolate two colors in OKLab), perceptual distance, and a nearest-color lookup over a candidate list (the engine of the picker's fuzzy and "nearest palette color" features).
2. **A `Color` value type carrying the three spec-required forms**: `oklab` (canonical), `srgbHex` (display/serialization), and `originalSpec` (optional source identifier, for example a brand color code), with a constructor that derives the canonical OKLab from a hex string so callers cannot create an inconsistent triple.
3. **A `PaletteRegistry`** (`core/registries/palettes.ts`) seeded with at least one bundled CC0 palette, each palette entry naming its colors with accessible color **names** in the three-form `Color` shape, mirroring `finishes.ts` and following ADR-0006. Optional era tagging (a `periods?: PeriodId[]` hint on a palette) so palettes can be biased by chronological period later.
4. **Project-local palettes (`Project.palettes[]`)** plus the commands to create, name, describe, and remove a project-local palette and to add or remove a color in one, all undoable through dispatch.
5. **The surface-by-surface paint-assignment model**: a `SurfaceRef` addressing a wall face, a floor, or a ceiling; a `PaintAssignment` pairing a `Color` and a `FinishRegistry` finish id; the `Project.paint` store keyed by a stable surface key; and the undoable `assignSurfacePaint` / `clearSurfacePaint` commands plus a pure `resolveSurfacePaint` reader.
6. **The site-metadata model**: `Project.site` (optional) with `latLong`, `northBearing`, and `obstructions[]` (top-down massing footprints with a height, a non-rendering placeholder per Phase 6), and the undoable commands to set the site location, the north bearing, and to add/remove an obstruction.
7. **A schema migration** advancing `CURRENT_SCHEMA_VERSION` for the new optional top-level `palettes`, `paint`, and `site` fields.
8. **A finish picker** (`editor/paint/finish-picker.tsx`) listing the six `FinishRegistry` finishes and dispatching the chosen finish.
9. **An OKLab-aware color picker** (`editor/paint/color-picker.tsx`) with a palette browser, a recent-colors strip, and a fuzzy color-name search, every chip carrying its accessible color name (design spec 7.4), dispatching the chosen color.
10. **A site-metadata editor** (`editor/metadata/site-editor.tsx`) to author the lat/long, north bearing, and obstruction list.
11. Barrel exports from `core/index.ts` and `editor/index.ts` for everything new.

### Explicitly NOT in this track (the deferral behind the three-dimensional render seam)

- **The live painted three-dimensional preview and the `PaintMaterial` shader's consumption of this model.** ADR-0045 records that the three-dimensional renderer and its paint material are a harness/stub today; the painted preview is a convergence node in ADR-0044 that gates on the three-dimensional preview track maturing. This track ships the model, the two-dimensional-side assignment, the registry, and the pickers; rendering painted surfaces in three dimensions waits. Nothing in this track touches `engine/` or imports Three.js.
- **The `SolarLightingProvider`** that would consume `site.latLong` and `site.obstructions` to produce sun direction and obstruction shadows (design spec 6.7, a Phase-8 item). The site model here is a non-rendering placeholder authored in the metadata surface only.
- **A two-dimensional swatch overlay of paint on the plan canvas.** Surfacing the assigned colors as fills on the plan render is a downstream user-experience-foundation polish cycle, not part of this model-and-picker track. The pickers dispatch assignments; visualizing them on the plan is separate.
- **Color-blindness simulation toggle** (design spec 7.4 calls it "optional"). The accessible color **name** on every chip is in scope; the simulation filter is a later accessibility cycle.
- **Display P3 wide-gamut output** (design spec 7.4: "where supported"). The canonical math and sRGB hex are in scope; P3 output is a renderer-boundary concern that rides with the three-dimensional render seam.
- **Importing brand or community palette packs** as installable JSON registry packs (ADR-0006 mentions "registry packs"). The `PaletteRegistry` follows the pack-ready shape, but pack installation tooling is the assets track.

### Hard invariants this track must hold

- `core/` imports neither React nor Three.js (rule 1). The color math, models, registry, site model, and commands are pure TypeScript in `core/`. The pickers and site editor are React-only in `editor/` and import their domain types and commands from the `core/` barrel, never from `engine/`.
- All mutations flow through `dispatch(command)` with a framework-captured inverse (rule 3, ADR-0005). The registry and the color math are immutable/pure; the only state changes are the palette, paint-assignment, and site commands, each reassigning a whole top-level slice of `Project` so the inverse-capture proxy records the change (the pattern proven in `room-commands.ts`).
- Conventional Commits, no `Co-Authored-By` trailers, no em-dashes in any prose, descriptive English names with no milestone or phase codes (rules 7, 8, 9, 10). No third-party or commercial product names anywhere (rule 11); palette and color names are generic descriptive names, never brand names. The optional `originalSpec` field is a free-text source identifier the user may type; the seeded bundled palette uses only descriptive, non-branded color names.
- The dependency cooldown and exact-pin rules forbid any new dependency. This track adds none; OKLab is implemented from the published conversion matrices.

---

## Decisions I made / open questions

These resolve the genuine forks so the track can proceed autonomously. Each is a best-practice default; revisit only if a later cycle contradicts it.

1. **Color is centralized in a new `core/color/` module.** Design spec 6.8 states "Color science is centralized in `core/color/`." The OKLab types, the conversions, and the perceptual operations live there. The `Color` three-form value type lives there too (it is a color concept, not a registry concept), and the registry and model import it.

2. **The three color forms are modeled as one `Color` value, constructed from hex.** Per design spec 7.4 a stored color is a triple: `oklab` (canonical), `srgbHex` (display/serialization), `originalSpec?` (source identifier). To make the triple impossible to desynchronize, the only constructor is `colorFromHex(srgbHex, originalSpec?)`, which computes `oklab` from the hex. `srgbHex` is the serialization form (a `#rrggbb` string); `oklab` is the canonical form used for all math; `originalSpec` is optional free text. A second constructor `colorFromOkLab(oklab, originalSpec?)` derives the hex for colors authored perceptually (the picker's OKLab-space adjustments). Both guarantee a consistent triple.

3. **OKLab is implemented from the published matrices, no dependency.** The cooldown and exact-pin rules make adding a color library costly, and the sRGB-to-OKLab path is a small, well-specified pair of matrix multiplies plus a cube-root nonlinearity. The implementer codes it from the canonical OKLab definition (linear-sRGB to LMS matrix, cube root, LMS-to-Lab matrix, and the inverse), with `no-magic-numbers` handled by naming the matrix as a declared constant table (the registries already disable that rule under `**/registries/**`; for `core/color/` the implementer names the matrix coefficients in a documented constant or adds a scoped eslint-disable with a WHY comment, the cleaner of the two as the reviewer judges).

4. **A surface is addressed by a stable `SurfaceRef`, not by a scene-graph node id.** The scene graph models floors, walls, rooms, openings, and dimensions, but it does NOT model wall faces, floor surfaces, or ceilings as first-class nodes (verified in `core/scene/scene-graph.ts`). A `SurfaceRef` is therefore a small discriminated reference into the model: `{ kind: 'wall-face'; wallId: string; side: 'left' | 'right' } | { kind: 'floor'; floorId: string } | { kind: 'ceiling'; floorId: string }`. The `side` of a wall face is the sign of the wall's left-hand normal, matching the convention `OpeningOrientation.facing` already uses (`'positive' | 'negative'` there; a wall face uses `'left' | 'right'` for the two faces, which reads more naturally for a surface and maps to the same two sides). A pure `surfaceKey(ref)` produces the stable string key the paint store is keyed by, so the assignment survives scene-graph re-derivation and undo restores by reference. This is the minimal addressing scheme that does not depend on the unbuilt three-dimensional surface nodes; when the three-dimensional track adds surface nodes, they carry the same `SurfaceRef` so the painted preview reads this exact store.

5. **`PaintAssignment` pairs a `Color` with a finish id.** Design spec 6.8: a painted surface is a base color plus a `FinishRegistry` finish mapped to material parameters. The assignment is `{ color: Color; finishId: string }` where `finishId` is a `FinishRegistry` id (validated at the registry boundary, not the alias, matching how `Opening.type` references an `ElementType` id). The finish defaults to `'matte'` when a color is assigned without an explicit finish (a neutral interior default; the user changes it with the finish picker).

6. **The paint store is a top-level `Project.paint` map keyed by surface key.** Mirroring `Project.roomOverrides`, `Project.paint?: Record<string, PaintAssignment>` is an optional top-level slice keyed by `surfaceKey(ref)`. The commands reassign the whole `paint` slice so the inverse-capture proxy records the root-level change and undo restores the prior reference (including back to an absent map). This is the exact pattern `mergeRoomOverride` uses.

7. **Project-local palettes are a top-level `Project.palettes[]` array of editable palettes; the `PaletteRegistry` is the read-only bundled set.** Design spec 3.1 places `palettes[]` as project-local ("user/global palettes live in LibraryStore"), and section 4.4 places the bundled palettes in the `PaletteRegistry`. So there are two homes: the immutable seeded `PaletteRegistry` (bundled CC0 palettes the picker browses) and the mutable `Project.palettes[]` (palettes the user creates in this project). A project-local palette is `{ id; name; description?; periods?; colors: NamedColor[] }`; a `NamedColor` is `{ name: string; color: Color }` (the accessible name is required, design spec 7.4). The create/rename/describe/add-color/remove-color/remove-palette commands operate on `Project.palettes[]`.

8. **Era tagging hook on palettes is an optional `periods?: PeriodId[]`.** ADR-0046 split era into period and style; palettes are era-tagged in practice by chronological period (a "1900s interior" palette), so the hook is `periods?: PeriodId[]` referencing the existing `PeriodRegistry`. It is optional and purely advisory in this track; period-biased palette ordering in the picker is a small later refinement, not a blocker. The same field exists on both a registry palette and a project-local palette.

9. **Site `obstructions[]` are top-down massing footprints with a height.** Design spec 3.1: `site (optional: latLong, northBearing, obstructions[])`, and Phase 6 describes obstructions as top-down massing with height (a non-rendering placeholder). An obstruction is `{ id; footprint: Point[]; height: number }` (the footprint in the same world-millimeter plan frame as walls, the height in millimeters). `latLong` is `{ latitude: number; longitude: number }` in decimal degrees; `northBearing` is a bearing in radians (the angle from plan-up to true north, matching the radian convention `UnderlayPlacement.rotation` already uses). None of this renders in this track.

10. **Validation policy follows the established registry-boundary convention.** Command factories and handlers do not reject unknown finish ids, period ids, palette ids, or malformed hex; the id is a string and the registry/parser is the authority. `colorFromHex` is the one exception: it must parse a `#rrggbb` (and `#rgb`) string and is the natural place to reject a malformed hex, because an unparseable hex cannot produce a canonical OKLab. The picker constrains the user to valid input upstream; the command layer trusts its caller, matching how `Opening.type` and the period/style ids already work.

11. **Pickers and the site editor take a `dispatch` prop and are otherwise presentational.** Mirroring `editor/plan/room-name-editor.tsx`, each component receives the current value(s) plus a `dispatch` callback and emits the relevant `core/` command. They do not own the dispatcher, do not read storage, and import only from the `core/` barrel and `editor/design-system`. This keeps them testable with `@testing-library/react` and a `vi.fn()` dispatch, and keeps the bridge wiring a downstream concern.

12. **The recent-colors strip is a prop, not persisted state in this track.** The color picker shows a `recent: Color[]` passed in by its caller and surfaces a selected color back through `dispatch`; where "recent" is sourced and persisted (selection state lives in `bridge/`, design spec 7.1) is wired downstream. This keeps the picker pure and testable and avoids reaching into storage from `editor/`.

---

## File structure

### New files (core)

- `core/color/oklab.ts`: `OkLab`, `LinearRgb`, `Srgb` types; `srgbToOkLab`, `okLabToSrgb`, `srgbToLinear`, `linearToSrgb` conversions.
- `core/color/oklab.test.ts`: conversion round-trip and known-value tests.
- `core/color/hex.ts`: `parseHex` (to `Srgb`), `formatHex` (from `Srgb`).
- `core/color/hex.test.ts`: hex parse/format tests, including malformed-hex rejection.
- `core/color/color.ts`: the `Color` three-form value type, the `colorFromHex` / `colorFromOkLab` constructors, and the `NamedColor` type (a name plus a `Color`).
- `core/color/color.test.ts`: three-form consistency tests.
- `core/color/operations.ts`: `mixColors`, `perceptualDistance`, `nearestColor`.
- `core/color/operations.test.ts`: mix, distance, and nearest-color tests.
- `core/registries/palettes.ts`: `Palette` (registry entry) interface and `builtinPalettes` registry. (`NamedColor` lives in `core/color/color.ts`; the registry imports it.)
- `core/registries/palettes.test.ts`: registry seeding and named-color tests.
- `core/model/paint.ts`: `SurfaceRef`, `PaintAssignment` types and the pure `surfaceKey` function.
- `core/model/paint.test.ts`: `surfaceKey` stability and discrimination tests.
- `core/model/site.ts`: `LatLong`, `Obstruction`, `Site` types (data shapes only; lives beside `types.ts`).
- `core/paint/resolve-surface-paint.ts`: pure `resolveSurfacePaint(project, ref)` reader.
- `core/paint/resolve-surface-paint.test.ts`: resolution tests.
- `core/commands/handlers/palette-commands.ts`: project-local palette commands and handlers.
- `core/commands/handlers/palette-commands.test.ts`: palette command tests.
- `core/commands/handlers/paint-commands.ts`: surface paint-assignment commands and handlers.
- `core/commands/handlers/paint-commands.test.ts`: paint command tests.
- `core/commands/handlers/site-commands.ts`: site-metadata commands and handlers.
- `core/commands/handlers/site-commands.test.ts`: site command tests.
- `core/migrations/schema/add-palettes-paint-and-site.ts`: schema migration for the new optional top-level fields.
- `core/migrations/schema/add-palettes-paint-and-site.test.ts`: migration test.

### New files (editor)

- `editor/paint/finish-picker.tsx`: the finish picker component.
- `editor/paint/finish-picker.test.tsx`: finish picker tests.
- `editor/paint/color-picker.tsx`: the OKLab-aware color picker with palette browser, recent strip, and fuzzy name search.
- `editor/paint/color-picker.test.tsx`: color picker tests.
- `editor/paint/color-name-search.ts`: the pure fuzzy color-name search helper the picker uses.
- `editor/paint/color-name-search.test.ts`: search-ranking tests.
- `editor/metadata/site-editor.tsx`: the site-metadata editor component.
- `editor/metadata/site-editor.test.tsx`: site editor tests.

### Modified files (kept minimal and additive; flagged for merge coordination)

- `core/model/types.ts`: add the optional top-level `palettes?`, `paint?`, and `site?` fields to `Project` (all additive). **Shared file: the structure/multi-floor track also reads and may extend `Project`/`Floor`. All edits here are additive optional top-level fields; sequence the merges and re-run typecheck after each.**
- `core/model/factories.ts`: bump `CURRENT_SCHEMA_VERSION`; optionally add a `createProjectPalette` factory. The new project fields are optional and default to absent, so `createEmptyProject` needs no signature change.
- `core/migrations/schema/index.ts`: append `addPalettesPaintAndSiteMigration` to `SCHEMA_MIGRATIONS`.
- `core/index.ts`: barrel exports for the color module, the palette registry, the paint model and commands, the site model and commands, and the resolver. **Shared file: append-only here; re-run typecheck after each merge.**
- `editor/index.ts`: barrel exports for the pickers and the site editor. **Shared file: the app-layout-shell track also edits `editor/index.ts`; append-only; re-run typecheck after each merge.**

---

## Fan-out groups for the orchestrator

The cycles split into two largely independent groups plus a converging tail, so the orchestrator can run them in parallel sub-streams:

- **Group A (pure-`core/`, no UI):** cycles 1 through 11. Within Group A there are three independent sub-streams that can interleave:
  - **Color sub-stream:** cycles 1, 2, 3, 4 (`core/color/`), then the palette registry cycle 5 (depends on the `Color` type from cycle 2).
  - **Paint-model sub-stream:** cycles 6, 7, 8 (surface ref, paint commands, resolver) depend on the `Color` type (cycle 2) and the model field (added in cycle 6's step).
  - **Site sub-stream:** cycle 9 (site model and commands) is fully independent of color and paint.
  - The migration (cycle 10) and the core barrel (cycle 11) converge the Group-A work and must run after the model fields they export exist.
- **Group B (editor UI):** cycles 12, 13, 14. Each depends only on the `core/` barrel exports (the `Color` type, the finish/palette registries, and the paint/site commands), so Group B starts once cycle 11 lands. The finish picker (12), the color picker (13), and the site editor (14) are independent of each other and fan out.

---

## Cycle 1: sRGB and OKLab conversion round-trips through linear sRGB

**Files:**

- Create: `core/color/oklab.ts`
- Test: `core/color/oklab.test.ts`

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Create `core/color/oklab.test.ts`.

**Test name:** `srgb and oklab conversions` > `round-trips an sRGB color through OKLab within tolerance`
**Assertion:** a mid-gray sRGB `{ r: 0.5, g: 0.5, b: 0.5 }` converted to OKLab and back is equal within a small epsilon; pure white `{ r: 1, g: 1, b: 1 }` has an OKLab lightness `L` near 1.0 and chroma components `a`, `b` near 0; pure black has `L` near 0.

```typescript
import { describe, expect, it } from 'vitest'
import { okLabToSrgb, srgbToOkLab } from './oklab'

const EPSILON = 1e-6

describe('srgb and oklab conversions', () => {
  it('round-trips an sRGB color through OKLab within tolerance', () => {
    const srgb = { r: 0.5, g: 0.5, b: 0.5 }
    const back = okLabToSrgb(srgbToOkLab(srgb))
    expect(back.r).toBeCloseTo(srgb.r, 5)
    expect(back.g).toBeCloseTo(srgb.g, 5)
    expect(back.b).toBeCloseTo(srgb.b, 5)
  })

  it('maps white to lightness near one with near-zero chroma', () => {
    const white = srgbToOkLab({ r: 1, g: 1, b: 1 })
    expect(white.L).toBeCloseTo(1, 2)
    expect(Math.abs(white.a)).toBeLessThan(1e-3)
    expect(Math.abs(white.b)).toBeLessThan(1e-3)
  })

  it('maps black to lightness near zero', () => {
    expect(srgbToOkLab({ r: 0, g: 0, b: 0 }).L).toBeLessThan(EPSILON)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/color/oklab.test.ts`
Expected: FAIL, cannot resolve module `./oklab`.

Commit: `git add core/color/oklab.test.ts && git commit -m "test: round-trip sRGB through OKLab"`

### GREEN

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

Create `core/color/oklab.ts`. Implement the canonical OKLab conversion: sRGB component to linear (the standard piecewise gamma), the linear-sRGB-to-LMS matrix, the cube-root nonlinearity, and the LMS-to-Lab matrix, plus the inverse path. Name the matrix coefficients in a documented constant block (or add a scoped `eslint-disable no-magic-numbers` with a WHY comment naming them as the published OKLab matrices).

```typescript
/** A color in the sRGB color space, each channel a 0..1 fraction (gamma-encoded). */
export interface Srgb {
  r: number
  g: number
  b: number
}

/** A color in linear-light sRGB, each channel a 0..1 fraction. */
export interface LinearRgb {
  r: number
  g: number
  b: number
}

/** A color in the OKLab perceptual space: L lightness (0..1), a and b chroma axes. */
export interface OkLab {
  L: number
  a: number
  b: number
}

export function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
}

export function linearToSrgb(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055
}

export function srgbToOkLab(srgb: Srgb): OkLab {
  const r = srgbToLinear(srgb.r)
  const g = srgbToLinear(srgb.g)
  const b = srgbToLinear(srgb.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

export function okLabToSrgb(lab: OkLab): Srgb {
  const l = (lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b) ** 3
  const m = (lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b) ** 3
  const s = (lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b) ** 3
  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/color/oklab.test.ts`
Expected: PASS.

Commit: `git add core/color/oklab.ts && git commit -m "feat: convert between sRGB and OKLab through linear sRGB"`

### BLUE

- [ ] **Step 5: Clean-code review then refactor (`/clean-code-review`, `/refactor`)**

Review against `.claude/rules.md`. The named risk is `no-magic-numbers` on the matrix coefficients (the ESLint gotchas memo: warnings count and force restructuring); the coefficients are the published OKLab matrices, so the refactorer either declares them in a named constant table or applies a scoped `eslint-disable` with a WHY comment, the cleaner of the two as the reviewer judges. Land the BLUE marker commit even if empty: `git commit --allow-empty -m "refactor: tidy the OKLab conversions"`.

---

## Cycle 2: A Color carries the three spec-required forms, constructed from a hex string

**Files:**

- Create: `core/color/hex.ts`
- Create: `core/color/color.ts`
- Test: `core/color/hex.test.ts`
- Test: `core/color/color.test.ts`

This cycle is two small behaviors; run them as two RGB sub-cycles (hex parse/format, then the `Color` constructor) or one combined cycle at the orchestrator's discretion. Both are shown.

### RED (sub-cycle 2a: hex)

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Create `core/color/hex.test.ts`.

**Test name:** `hex parsing and formatting` > `parses and formats #rrggbb sRGB`
**Assertion:** `parseHex('#ffffff')` is `{ r: 1, g: 1, b: 1 }`; `parseHex('#000000')` is `{ r: 0, g: 0, b: 0 }`; `formatHex({ r: 1, g: 1, b: 1 })` is `'#ffffff'`; `parseHex('#abc')` expands the shorthand; a malformed string (`'not-a-color'`) throws.

```typescript
import { describe, expect, it } from 'vitest'
import { formatHex, parseHex } from './hex'

describe('hex parsing and formatting', () => {
  it('parses #rrggbb into 0..1 sRGB channels', () => {
    expect(parseHex('#ffffff')).toEqual({ r: 1, g: 1, b: 1 })
    expect(parseHex('#000000')).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('expands #rgb shorthand', () => {
    expect(parseHex('#fff')).toEqual({ r: 1, g: 1, b: 1 })
  })

  it('formats sRGB back to lowercase #rrggbb', () => {
    expect(formatHex({ r: 1, g: 1, b: 1 })).toBe('#ffffff')
    expect(formatHex({ r: 0, g: 0, b: 0 })).toBe('#000000')
  })

  it('throws on a malformed hex string', () => {
    expect(() => parseHex('not-a-color')).toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/color/hex.test.ts`
Expected: FAIL, cannot resolve module `./hex`.

Commit: `git add core/color/hex.test.ts && git commit -m "test: parse and format sRGB hex"`

### GREEN (sub-cycle 2a)

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

Create `core/color/hex.ts`. Parse `#rgb` and `#rrggbb` to `Srgb` 0..1 channels; format `Srgb` to lowercase `#rrggbb`; throw a clear error on a malformed string (exceptions over error codes, rule: error handling).

```typescript
import type { Srgb } from './oklab'

const MAX_CHANNEL = 255

function channelToHex(channel: number): string {
  return Math.round(channel * MAX_CHANNEL)
    .toString(16)
    .padStart(2, '0')
}

export function formatHex(srgb: Srgb): string {
  return `#${channelToHex(srgb.r)}${channelToHex(srgb.g)}${channelToHex(srgb.b)}`
}

export function parseHex(hex: string): Srgb {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (match === null) {
    throw new Error(`Not a valid hex color: "${hex}"`)
  }
  const digits = match[1]!
  const full = digits.length === 3 ? digits.replace(/(.)/g, '$1$1') : digits
  return {
    r: parseInt(full.slice(0, 2), 16) / MAX_CHANNEL,
    g: parseInt(full.slice(2, 4), 16) / MAX_CHANNEL,
    b: parseInt(full.slice(4, 6), 16) / MAX_CHANNEL,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/color/hex.test.ts`
Expected: PASS.

Commit: `git add core/color/hex.ts && git commit -m "feat: parse and format sRGB hex"`

### BLUE (sub-cycle 2a)

- [ ] **Step 5: Review and marker commit.** Watch `no-magic-numbers` on `255` and `16` (named or eslint-disabled with a WHY). Land: `git commit --allow-empty -m "refactor: tidy the hex parser"`.

### RED (sub-cycle 2b: Color)

- [ ] **Step 6: Write the failing test (test-author, `/test-first`)**

Create `core/color/color.test.ts`.

**Test name:** `color value` > `derives a consistent OKLab canonical form from a hex string`
**Assertion:** `colorFromHex('#ffffff')` has `srgbHex === '#ffffff'`, an `oklab.L` near 1, and no `originalSpec`; `colorFromHex('#336699', 'Heritage Blue 12')` carries that `originalSpec`; the `oklab` on the result equals `srgbToOkLab(parseHex(hex))`.

```typescript
import { describe, expect, it } from 'vitest'
import { colorFromHex } from './color'
import { parseHex } from './hex'
import { srgbToOkLab } from './oklab'

describe('color value', () => {
  it('derives a consistent OKLab canonical form from a hex string', () => {
    const color = colorFromHex('#336699')
    expect(color.srgbHex).toBe('#336699')
    expect(color.oklab).toEqual(srgbToOkLab(parseHex('#336699')))
    expect(color.originalSpec).toBeUndefined()
  })

  it('carries an optional original-spec source identifier', () => {
    expect(colorFromHex('#336699', 'Heritage Blue 12').originalSpec).toBe('Heritage Blue 12')
  })

  it('maps white to a near-one lightness', () => {
    expect(colorFromHex('#ffffff').oklab.L).toBeCloseTo(1, 2)
  })
})
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `pnpm exec vitest run core/color/color.test.ts`
Expected: FAIL, cannot resolve module `./color`.

Commit: `git add core/color/color.test.ts && git commit -m "test: build a three-form Color from a hex string"`

### GREEN (sub-cycle 2b)

- [ ] **Step 8: Write the minimal implementation (implementer, `/implement`)**

Create `core/color/color.ts`. The only constructors are the two that guarantee a consistent triple. The optional `originalSpec` is omitted from the object when absent (exactOptionalPropertyTypes, matching the `rebuildMetaStyle` pattern in `project-commands.ts`).

```typescript
import { formatHex, parseHex } from './hex'
import { okLabToSrgb, srgbToOkLab, type OkLab } from './oklab'

/**
 * A stored color in the three forms the design specification (section 7.4)
 * requires: OKLab (canonical, used for all math), sRGB hex (display and
 * serialization), and an optional originalSpec source identifier (for example a
 * descriptive source color code the user records). The triple is always
 * consistent because it is only built through the constructors below.
 */
export interface Color {
  oklab: OkLab
  srgbHex: string
  originalSpec?: string
}

export function colorFromHex(srgbHex: string, originalSpec?: string): Color {
  const oklab = srgbToOkLab(parseHex(srgbHex))
  const normalizedHex = formatHex(parseHex(srgbHex))
  return { oklab, srgbHex: normalizedHex, ...(originalSpec !== undefined ? { originalSpec } : {}) }
}

export function colorFromOkLab(oklab: OkLab, originalSpec?: string): Color {
  const srgbHex = formatHex(okLabToSrgb(oklab))
  return { oklab, srgbHex, ...(originalSpec !== undefined ? { originalSpec } : {}) }
}

/**
 * A color with a required accessible name (design spec 7.4: every chip carries
 * its name). It lives here, beside Color, so both the palette registry and the
 * project-local palette model import it from one home and the import direction
 * stays core/registries and core/model both depending on core/color.
 */
export interface NamedColor {
  name: string
  color: Color
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm exec vitest run core/color/color.test.ts`
Expected: PASS.

Commit: `git add core/color/color.ts && git commit -m "feat: build a three-form Color from a hex string"`

### BLUE (sub-cycle 2b)

- [ ] **Step 10: Review and marker commit.** Land: `git commit --allow-empty -m "refactor: tidy the Color value type"`.

---

## Cycle 3: Perceptual color operations: mix, distance, nearest

**Files:**

- Create: `core/color/operations.ts`
- Test: `core/color/operations.test.ts`

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Create `core/color/operations.test.ts`.

**Test name:** `perceptual color operations` > `mixes, measures distance, and finds the nearest color in OKLab`
**Assertion:** `mixColors(black, white, 0.5)` has an OKLab `L` between the two endpoints (a perceptual midpoint); `perceptualDistance(c, c)` is 0 and a distinct color has a positive distance; `nearestColor(target, candidates)` returns the candidate with the smallest perceptual distance.

```typescript
import { describe, expect, it } from 'vitest'
import { colorFromHex } from './color'
import { mixColors, nearestColor, perceptualDistance } from './operations'

describe('perceptual color operations', () => {
  it('mixes two colors at a perceptual midpoint in OKLab', () => {
    const mid = mixColors(colorFromHex('#000000'), colorFromHex('#ffffff'), 0.5)
    expect(mid.oklab.L).toBeGreaterThan(0)
    expect(mid.oklab.L).toBeLessThan(1)
  })

  it('reports zero distance to itself and positive distance to a different color', () => {
    const blue = colorFromHex('#336699')
    expect(perceptualDistance(blue, blue)).toBeCloseTo(0, 6)
    expect(perceptualDistance(blue, colorFromHex('#ffffff'))).toBeGreaterThan(0)
  })

  it('finds the nearest candidate color by perceptual distance', () => {
    const candidates = [colorFromHex('#000000'), colorFromHex('#ffffff'), colorFromHex('#346599')]
    expect(nearestColor(colorFromHex('#336699'), candidates)?.srgbHex).toBe('#346599')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/color/operations.test.ts`
Expected: FAIL, cannot resolve module `./operations`.

Commit: `git add core/color/operations.test.ts && git commit -m "test: mix, measure, and find the nearest color in OKLab"`

### GREEN

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

Create `core/color/operations.ts`. Mix interpolates each OKLab component and rebuilds a `Color`; distance is the Euclidean distance in OKLab; nearest is a linear scan returning the closest candidate (or `undefined` for an empty list, never null per the error-handling rule).

```typescript
import { colorFromOkLab, type Color } from './color'

export function mixColors(from: Color, to: Color, t: number): Color {
  return colorFromOkLab({
    L: from.oklab.L + (to.oklab.L - from.oklab.L) * t,
    a: from.oklab.a + (to.oklab.a - from.oklab.a) * t,
    b: from.oklab.b + (to.oklab.b - from.oklab.b) * t,
  })
}

export function perceptualDistance(from: Color, to: Color): number {
  const dL = from.oklab.L - to.oklab.L
  const da = from.oklab.a - to.oklab.a
  const db = from.oklab.b - to.oklab.b
  return Math.hypot(dL, da, db)
}

export function nearestColor(target: Color, candidates: readonly Color[]): Color | undefined {
  let best: Color | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const distance = perceptualDistance(target, candidate)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/color/operations.test.ts`
Expected: PASS.

Commit: `git add core/color/operations.ts && git commit -m "feat: mix, measure, and find the nearest color in OKLab"`

### BLUE

- [ ] **Step 5: Review and marker commit.** Watch `max-lines-per-function` on `nearestColor` (the loop is fine, well under 40 lines). Land: `git commit --allow-empty -m "refactor: tidy the color operations"`.

---

## Cycle 4: The palette registry is seeded with a bundled CC0 palette of named colors

**Files:**

- Create: `core/registries/palettes.ts`
- Test: `core/registries/palettes.test.ts`

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Create `core/registries/palettes.test.ts`.

**Test name:** `builtin palettes` > `seeds at least one bundled palette of named three-form colors`
**Assertion:** the registry version equals `PALETTE_REGISTRY_VERSION`; there is at least one palette; the first palette's colors each carry a non-empty accessible `name` and a `Color` whose `srgbHex` is a valid `#rrggbb` string and whose `oklab` is consistent with that hex.

```typescript
import { describe, expect, it } from 'vitest'
import { getEntry } from './registry'
import { PALETTE_REGISTRY_VERSION, builtinPalettes } from './palettes'
import { srgbToOkLab } from '../color/oklab'
import { parseHex } from '../color/hex'

describe('builtin palettes', () => {
  it('seeds at least one bundled palette with the registry version', () => {
    expect(builtinPalettes.version).toBe(PALETTE_REGISTRY_VERSION)
    expect(Object.keys(builtinPalettes.entries).length).toBeGreaterThan(0)
  })

  it('names every color and keeps its three forms consistent', () => {
    const palette = Object.values(builtinPalettes.entries)[0]!
    expect(palette.colors.length).toBeGreaterThan(0)
    for (const named of palette.colors) {
      expect(named.name.length).toBeGreaterThan(0)
      expect(named.color.srgbHex).toMatch(/^#[0-9a-f]{6}$/)
      expect(named.color.oklab).toEqual(srgbToOkLab(parseHex(named.color.srgbHex)))
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/registries/palettes.test.ts`
Expected: FAIL, cannot resolve module `./palettes`.

Commit: `git add core/registries/palettes.test.ts && git commit -m "test: seed a palette registry with named three-form colors"`

### GREEN

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

Create `core/registries/palettes.ts`, mirroring `finishes.ts`. Seed one bundled CC0 palette of descriptive, non-branded historic interior colors (rule 11: no brand names). The optional `periods?` era-tagging hook references `PeriodId`.

```typescript
import { colorFromHex, type NamedColor } from '../color/color'
import type { PeriodId } from '../model/types'
import { createRegistry, type Registry, type RegistryEntry } from './registry'

/**
 * A bundled palette in the PaletteRegistry. Project-local palettes (the
 * user-editable ones) live on Project.palettes; these are the read-only seeded
 * set the picker browses (design spec 3.1 and 4.4). The optional periods hint
 * lets a later cycle bias palettes by chronological period (ADR-0046).
 */
export interface Palette extends RegistryEntry {
  displayName: Record<string, string>
  description?: string
  periods?: PeriodId[]
  colors: NamedColor[]
}

export const PALETTE_REGISTRY_VERSION = 1

/* eslint-disable @typescript-eslint/naming-convention -- BCP 47 locale keys are data, not identifiers. */
export const builtinPalettes: Registry<Palette> = createRegistry(PALETTE_REGISTRY_VERSION, [
  {
    id: 'historic-interior-neutrals',
    displayName: { 'en-US': 'Historic Interior Neutrals' },
    description: 'A neutral old-house interior palette of warm whites, putties, and soft greens.',
    periods: ['victorian', 'edwardian'],
    colors: [
      { name: 'Warm White', color: colorFromHex('#f4efe6') },
      { name: 'Putty', color: colorFromHex('#cdc2ad') },
      { name: 'Sage Green', color: colorFromHex('#9aa583') },
      { name: 'Slate Blue', color: colorFromHex('#5b6e7a') },
      { name: 'Oxblood', color: colorFromHex('#6e2b2b') },
      { name: 'Charcoal', color: colorFromHex('#33312e') },
    ],
  },
])
/* eslint-enable @typescript-eslint/naming-convention */
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/registries/palettes.test.ts`
Expected: PASS.

Commit: `git add core/registries/palettes.ts && git commit -m "feat: add the palette registry seeded with a bundled palette"`

### BLUE

- [ ] **Step 5: Review and marker commit.** `no-magic-numbers` is already disabled under `**/registries/**` (ADR-0006), so the hex strings and the seed are fine. Confirm no color name reads as a brand name. Land: `git commit --allow-empty -m "refactor: tidy the palette registry"`.

---

## Cycle 5: Project-local palettes are created, named, described, and edited through commands

**Files:**

- Modify: `core/model/types.ts` (add `Project.palettes?`)
- Modify: `core/model/factories.ts` (optional `createProjectPalette` factory)
- Create: `core/commands/handlers/palette-commands.ts`
- Test: `core/commands/handlers/palette-commands.test.ts`

The test-author may add the `palettes?` field to fixtures as needed to compile; the implementer owns the production type.

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Create `core/commands/handlers/palette-commands.test.ts`, mirroring the dispatcher-driven structure of `room-commands.test.ts`.

**Test names:**

- `createProjectPalette` > `adds a named project-local palette and removes it on undo`
- `addPaletteColor` > `appends a named color to a project-local palette`
- `renameProjectPalette` > `renames a palette while leaving its colors intact`

**Assertions:** dispatching `createProjectPalette({ id, name })` appends a palette to `project.palettes`; undo removes it (and restores `palettes` to absent if it was absent). Dispatching `addPaletteColor(paletteId, { name, color })` appends the named color to that palette's `colors`. Dispatching `renameProjectPalette(paletteId, name)` changes the name and preserves the colors.

```typescript
import { describe, expect, it } from 'vitest'
import {
  addPaletteColor,
  createProjectPalette,
  registerPaletteCommands,
  renameProjectPalette,
} from './palette-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject } from '../../model/factories'
import { colorFromHex } from '../../color/color'
import type { Project } from '../../model/types'

const PALETTE_ID = 'palette-1'

function newProject(): Project {
  return createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
}

function dispatcherFor(project: Project): Dispatcher<Project> {
  const registry = new CommandRegistry<Project>()
  registerPaletteCommands(registry)
  return new Dispatcher<Project>(project, registry)
}

describe('createProjectPalette', () => {
  it('adds a named project-local palette', () => {
    const project = newProject()
    dispatcherFor(project).dispatch(createProjectPalette({ id: PALETTE_ID, name: 'My Palette' }))
    expect(project.palettes?.[0]).toMatchObject({ id: PALETTE_ID, name: 'My Palette', colors: [] })
  })

  it('restores absent palettes on undo when none existed before', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(createProjectPalette({ id: PALETTE_ID, name: 'My Palette' }))
    dispatcher.undo()
    expect(project.palettes).toBeUndefined()
  })
})

describe('addPaletteColor', () => {
  it('appends a named color to a project-local palette', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(createProjectPalette({ id: PALETTE_ID, name: 'My Palette' }))
    dispatcher.dispatch(
      addPaletteColor(PALETTE_ID, { name: 'Sage', color: colorFromHex('#9aa583') }),
    )
    expect(project.palettes?.[0]?.colors[0]).toMatchObject({ name: 'Sage' })
  })
})

describe('renameProjectPalette', () => {
  it('renames a palette while leaving its colors intact', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(createProjectPalette({ id: PALETTE_ID, name: 'Old' }))
    dispatcher.dispatch(
      addPaletteColor(PALETTE_ID, { name: 'Sage', color: colorFromHex('#9aa583') }),
    )
    dispatcher.dispatch(renameProjectPalette(PALETTE_ID, 'New'))
    expect(project.palettes?.[0]?.name).toBe('New')
    expect(project.palettes?.[0]?.colors).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/commands/handlers/palette-commands.test.ts`
Expected: FAIL, cannot resolve module `./palette-commands` (and `Project.palettes` does not exist).

Commit: `git add core/commands/handlers/palette-commands.test.ts core/model/types.ts && git commit -m "test: create and edit project-local palettes through commands"`

### GREEN

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

Add the `ProjectPalette` type and the `Project.palettes?` field to `core/model/types.ts`:

```typescript
import type { NamedColor } from '../color/color'

/**
 * A project-local, user-editable palette (design spec 3.1: palettes[] is
 * project-local; the read-only bundled palettes live in the PaletteRegistry).
 */
export interface ProjectPalette {
  id: string
  name: string
  description?: string
  /** Optional chronological-period tags, referencing the PeriodRegistry (ADR-0046). */
  periods?: PeriodId[]
  colors: NamedColor[]
}
```

Note on the import direction: `NamedColor` lives in `core/color/color.ts` (cycle 2), so both `core/model/types.ts` here and `core/registries/palettes.ts` (cycle 4) import it from there. This keeps the direction `core/model` and `core/registries` both depending on `core/color`, with no `core/model -> core/registries` cycle. (`PeriodId` is already defined in `core/model/types.ts`, so it needs no import here.)

Add the field to `Project`:

```typescript
export interface Project {
  meta: ProjectMeta
  floors: Floor[]
  roomOverrides?: Record<string, RoomOverride> | undefined
  /** Project-local, user-editable palettes (design spec 3.1). Absent means none. */
  palettes?: ProjectPalette[] | undefined
}
```

Create `core/commands/handlers/palette-commands.ts`. Each handler reassigns the whole `palettes` slice so the inverse-capture proxy records the root-level change (the pattern from `room-commands.ts` and `addFloorHandler`).

```typescript
import type { NamedColor } from '../../color/color'
import type { Project, ProjectPalette } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const CREATE_PROJECT_PALETTE = 'palette/create'
export const REMOVE_PROJECT_PALETTE = 'palette/remove'
export const RENAME_PROJECT_PALETTE = 'palette/rename'
export const ADD_PALETTE_COLOR = 'palette/add-color'
export const REMOVE_PALETTE_COLOR = 'palette/remove-color'

export interface CreateProjectPaletteParams {
  palette: ProjectPalette
}
export function createProjectPalette(init: {
  id: string
  name: string
  description?: string
}): Command<CreateProjectPaletteParams> {
  const palette: ProjectPalette = {
    id: init.id,
    name: init.name,
    colors: [],
    ...(init.description !== undefined ? { description: init.description } : {}),
  }
  return { type: CREATE_PROJECT_PALETTE, params: { palette }, description: 'Create palette' }
}

const createProjectPaletteHandler: CommandHandler<Project, CreateProjectPaletteParams> = {
  apply(state, params) {
    state.palettes = [...(state.palettes ?? []), params.palette]
  },
}
```

Add `removeProjectPalette(paletteId)` (filters the array), `renameProjectPalette(paletteId, name)` (maps, replacing the matching palette's `name`), `addPaletteColor(paletteId, color: NamedColor)` (maps, appending to the matching palette's `colors`), and `removePaletteColor(paletteId, index)` (maps, splicing the color). Each handler reassigns `state.palettes` whole. Register all five in `registerPaletteCommands`.

Optionally add a `createProjectPalette` factory to `core/model/factories.ts` if a non-command construction site wants one; the command's inline builder above is sufficient otherwise.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/commands/handlers/palette-commands.test.ts`
Expected: PASS. Run `pnpm typecheck` to confirm the new model field compiles.

Commit: `git add core/model/types.ts core/commands/handlers/palette-commands.ts && git commit -m "feat: create and edit project-local palettes through commands"`

### BLUE

- [ ] **Step 5: Review and marker commit.** Watch `max-lines` on `palette-commands.ts` (300-line ceiling; five command/handler pairs may approach it) and `max-params` (3; the create command takes one options object, good). If ESLint flags `max-lines`, the refactorer may split color-level commands into a sibling module. Land: `git commit --allow-empty -m "refactor: tidy the palette commands"`.

---

## Cycle 6: A surface is addressed by a stable SurfaceRef and keyed for the paint store

**Files:**

- Create: `core/model/paint.ts`
- Test: `core/model/paint.test.ts`

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Create `core/model/paint.test.ts`.

**Test name:** `surfaceKey` > `produces a stable, discriminating key for each surface kind`
**Assertion:** `surfaceKey` of a wall-face ref is stable across calls and distinguishes the two faces of the same wall; a floor ref and a ceiling ref on the same floor produce different keys; two structurally equal refs produce the same key.

```typescript
import { describe, expect, it } from 'vitest'
import { surfaceKey, type SurfaceRef } from './paint'

const leftFace: SurfaceRef = { kind: 'wall-face', wallId: 'wall-1', side: 'left' }
const rightFace: SurfaceRef = { kind: 'wall-face', wallId: 'wall-1', side: 'right' }
const floor: SurfaceRef = { kind: 'floor', floorId: 'floor-1' }
const ceiling: SurfaceRef = { kind: 'ceiling', floorId: 'floor-1' }

describe('surfaceKey', () => {
  it('is stable for structurally equal refs', () => {
    expect(surfaceKey({ kind: 'floor', floorId: 'floor-1' })).toBe(surfaceKey(floor))
  })

  it('distinguishes the two faces of one wall', () => {
    expect(surfaceKey(leftFace)).not.toBe(surfaceKey(rightFace))
  })

  it('distinguishes a floor from a ceiling on the same floor', () => {
    expect(surfaceKey(floor)).not.toBe(surfaceKey(ceiling))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/model/paint.test.ts`
Expected: FAIL, cannot resolve module `./paint`.

Commit: `git add core/model/paint.test.ts && git commit -m "test: key a paintable surface stably by its reference"`

### GREEN

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

Create `core/model/paint.ts`.

```typescript
import type { Color } from '../color/color'

/**
 * A reference to a paintable surface. The scene graph does not yet model wall
 * faces, floor surfaces, or ceilings as first-class nodes, so a surface is
 * addressed by the model entity it belongs to plus a discriminator. When the
 * three-dimensional track adds surface nodes, they carry this same SurfaceRef so
 * the painted preview reads the paint store keyed below.
 */
export type SurfaceRef =
  | { kind: 'wall-face'; wallId: string; side: 'left' | 'right' }
  | { kind: 'floor'; floorId: string }
  | { kind: 'ceiling'; floorId: string }

/** A paint assignment: a color in the three forms plus a FinishRegistry finish id. */
export interface PaintAssignment {
  color: Color
  finishId: string
}

/** The stable string key the paint store is keyed by. Derivation-independent. */
export function surfaceKey(ref: SurfaceRef): string {
  switch (ref.kind) {
    case 'wall-face':
      return `wall-face:${ref.wallId}:${ref.side}`
    case 'floor':
      return `floor:${ref.floorId}`
    case 'ceiling':
      return `ceiling:${ref.floorId}`
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/model/paint.test.ts`
Expected: PASS.

Commit: `git add core/model/paint.ts && git commit -m "feat: key a paintable surface stably by its reference"`

### BLUE

- [ ] **Step 5: Review and marker commit.** The `switch` is exhaustive over the union (no default needed; the union is closed). Land: `git commit --allow-empty -m "refactor: tidy the surface reference"`.

---

## Cycle 7: A surface is painted and cleared through undoable commands

**Files:**

- Modify: `core/model/types.ts` (add `Project.paint?`)
- Create: `core/commands/handlers/paint-commands.ts`
- Test: `core/commands/handlers/paint-commands.test.ts`

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Create `core/commands/handlers/paint-commands.test.ts`, mirroring `room-commands.test.ts`.

**Test names:**

- `assignSurfacePaint` > `paints a wall face with a color and finish and clears it on undo`
- `assignSurfacePaint` > `defaults the finish to matte when none is given`
- `clearSurfacePaint` > `removes a surface assignment and restores it on undo`

**Assertions:** dispatching `assignSurfacePaint(ref, color, 'satin')` records `{ color, finishId: 'satin' }` at `project.paint[surfaceKey(ref)]`; undo restores the prior state (absent when the map was absent). Dispatching `assignSurfacePaint(ref, color)` (no finish) records `finishId: 'matte'`. Painting a second distinct surface leaves the first intact. `clearSurfacePaint(ref)` removes the entry; undo restores it.

```typescript
import { describe, expect, it } from 'vitest'
import { assignSurfacePaint, clearSurfacePaint, registerPaintCommands } from './paint-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject } from '../../model/factories'
import { surfaceKey, type SurfaceRef } from '../../model/paint'
import { colorFromHex } from '../../color/color'
import type { Project } from '../../model/types'

const REF: SurfaceRef = { kind: 'wall-face', wallId: 'wall-1', side: 'left' }
const SAGE = colorFromHex('#9aa583')

function newProject(): Project {
  return createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
}

function dispatcherFor(project: Project): Dispatcher<Project> {
  const registry = new CommandRegistry<Project>()
  registerPaintCommands(registry)
  return new Dispatcher<Project>(project, registry)
}

describe('assignSurfacePaint', () => {
  it('paints a wall face with a color and finish', () => {
    const project = newProject()
    dispatcherFor(project).dispatch(assignSurfacePaint(REF, SAGE, 'satin'))
    expect(project.paint?.[surfaceKey(REF)]).toEqual({ color: SAGE, finishId: 'satin' })
  })

  it('defaults the finish to matte when none is given', () => {
    const project = newProject()
    dispatcherFor(project).dispatch(assignSurfacePaint(REF, SAGE))
    expect(project.paint?.[surfaceKey(REF)]?.finishId).toBe('matte')
  })

  it('restores absent paint on undo when none existed before', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(assignSurfacePaint(REF, SAGE, 'satin'))
    dispatcher.undo()
    expect(project.paint).toBeUndefined()
  })
})

describe('clearSurfacePaint', () => {
  it('removes a surface assignment and restores it on undo', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(assignSurfacePaint(REF, SAGE, 'satin'))
    dispatcher.dispatch(clearSurfacePaint(REF))
    expect(project.paint?.[surfaceKey(REF)]).toBeUndefined()
    dispatcher.undo()
    expect(project.paint?.[surfaceKey(REF)]).toEqual({ color: SAGE, finishId: 'satin' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/commands/handlers/paint-commands.test.ts`
Expected: FAIL, cannot resolve module `./paint-commands` (and `Project.paint` does not exist).

Commit: `git add core/commands/handlers/paint-commands.test.ts core/model/types.ts && git commit -m "test: paint and clear a surface through commands"`

### GREEN

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

Add the `Project.paint?` field to `core/model/types.ts` (import `PaintAssignment` from `./paint`):

```typescript
import type { PaintAssignment } from './paint'

export interface Project {
  meta: ProjectMeta
  floors: Floor[]
  roomOverrides?: Record<string, RoomOverride> | undefined
  palettes?: ProjectPalette[] | undefined
  /** Surface paint assignments keyed by surfaceKey(ref). Absent means none. */
  paint?: Record<string, PaintAssignment> | undefined
}
```

Create `core/commands/handlers/paint-commands.ts`. The default finish is `'matte'` (decision 5). Each handler reassigns the whole `paint` slice.

```typescript
import { surfaceKey, type SurfaceRef, type PaintAssignment } from '../../model/paint'
import type { Color } from '../../color/color'
import type { Project } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const ASSIGN_SURFACE_PAINT = 'paint/assign'
export const CLEAR_SURFACE_PAINT = 'paint/clear'

const DEFAULT_FINISH_ID = 'matte'

export interface AssignSurfacePaintParams {
  key: string
  assignment: PaintAssignment
}

export function assignSurfacePaint(
  ref: SurfaceRef,
  color: Color,
  finishId: string = DEFAULT_FINISH_ID,
): Command<AssignSurfacePaintParams> {
  return {
    type: ASSIGN_SURFACE_PAINT,
    params: { key: surfaceKey(ref), assignment: { color, finishId } },
    description: 'Paint surface',
  }
}

const assignSurfacePaintHandler: CommandHandler<Project, AssignSurfacePaintParams> = {
  apply(state, params) {
    state.paint = { ...state.paint, [params.key]: params.assignment }
  },
}

export interface ClearSurfacePaintParams {
  key: string
}

export function clearSurfacePaint(ref: SurfaceRef): Command<ClearSurfacePaintParams> {
  return {
    type: CLEAR_SURFACE_PAINT,
    params: { key: surfaceKey(ref) },
    description: 'Clear surface paint',
  }
}

const clearSurfacePaintHandler: CommandHandler<Project, ClearSurfacePaintParams> = {
  apply(state, params) {
    const next = { ...state.paint }
    delete next[params.key]
    state.paint = next
  },
}

export function registerPaintCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  return registry
    .register(ASSIGN_SURFACE_PAINT, assignSurfacePaintHandler)
    .register(CLEAR_SURFACE_PAINT, clearSurfacePaintHandler)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/commands/handlers/paint-commands.test.ts`
Expected: PASS.

Commit: `git add core/model/types.ts core/commands/handlers/paint-commands.ts && git commit -m "feat: paint and clear a surface through commands"`

### BLUE

- [ ] **Step 5: Review and marker commit.** `assignSurfacePaint` has a default-parameter (not a flag argument), which is acceptable. Land: `git commit --allow-empty -m "refactor: tidy the paint commands"`.

---

## Cycle 8: The effective paint of a surface resolves from the store

**Files:**

- Create: `core/paint/resolve-surface-paint.ts`
- Test: `core/paint/resolve-surface-paint.test.ts`

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Create `core/paint/resolve-surface-paint.test.ts`.

**Test name:** `resolveSurfacePaint` > `returns the assignment for a painted surface and undefined otherwise`
**Assertion:** with `project.paint` carrying an assignment at `surfaceKey(ref)`, `resolveSurfacePaint(project, ref)` returns it; for an unpainted surface (or an absent `paint` map) it returns `undefined`.

```typescript
import { describe, expect, it } from 'vitest'
import { resolveSurfacePaint } from './resolve-surface-paint'
import { surfaceKey, type SurfaceRef } from '../model/paint'
import { colorFromHex } from '../color/color'
import { createEmptyProject } from '../model/factories'
import type { Project } from '../model/types'

const REF: SurfaceRef = { kind: 'floor', floorId: 'floor-1' }

function newProject(): Project {
  return createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
}

describe('resolveSurfacePaint', () => {
  it('returns undefined for an unpainted surface', () => {
    expect(resolveSurfacePaint(newProject(), REF)).toBeUndefined()
  })

  it('returns the assignment for a painted surface', () => {
    const project = newProject()
    const assignment = { color: colorFromHex('#9aa583'), finishId: 'satin' }
    project.paint = { [surfaceKey(REF)]: assignment }
    expect(resolveSurfacePaint(project, REF)).toEqual(assignment)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/paint/resolve-surface-paint.test.ts`
Expected: FAIL, cannot resolve module `./resolve-surface-paint`.

Commit: `git add core/paint/resolve-surface-paint.test.ts && git commit -m "test: resolve the effective paint of a surface"`

### GREEN

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

Create `core/paint/resolve-surface-paint.ts`.

```typescript
import { surfaceKey, type PaintAssignment, type SurfaceRef } from '../model/paint'
import type { Project } from '../model/types'

/** The paint assigned to a surface, or undefined when the surface is unpainted. */
export function resolveSurfacePaint(
  project: Project,
  ref: SurfaceRef,
): PaintAssignment | undefined {
  return project.paint?.[surfaceKey(ref)]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/paint/resolve-surface-paint.test.ts`
Expected: PASS.

Commit: `git add core/paint/resolve-surface-paint.ts && git commit -m "feat: resolve the effective paint of a surface"`

### BLUE

- [ ] **Step 5: Review and marker commit.** Land: `git commit --allow-empty -m "refactor: tidy the surface-paint resolver"`.

---

## Cycle 9: The project carries optional site metadata, set through commands

**Files:**

- Create: `core/model/site.ts`
- Modify: `core/model/types.ts` (add `Project.site?`)
- Create: `core/commands/handlers/site-commands.ts`
- Test: `core/commands/handlers/site-commands.test.ts`

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Create `core/commands/handlers/site-commands.test.ts`.

**Test names:**

- `setSiteLocation` > `records a lat/long and clears it on undo`
- `setSiteNorthBearing` > `records the north bearing`
- `addObstruction` > `appends a top-down massing obstruction and removes it on undo`

**Assertions:** dispatching `setSiteLocation({ latitude, longitude })` records `project.site.latLong`; undo restores the prior state (absent `site` when none existed). `setSiteNorthBearing(radians)` records `project.site.northBearing`. `addObstruction({ id, footprint, height })` appends to `project.site.obstructions`; undo removes it; `removeObstruction(id)` removes a named one.

```typescript
import { describe, expect, it } from 'vitest'
import {
  addObstruction,
  registerSiteCommands,
  removeObstruction,
  setSiteLocation,
  setSiteNorthBearing,
} from './site-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject } from '../../model/factories'
import type { Obstruction } from '../../model/site'
import type { Project } from '../../model/types'

const OBSTRUCTION: Obstruction = {
  id: 'tree-1',
  footprint: [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 1000 },
  ],
  height: 6000,
}

function newProject(): Project {
  return createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
}

function dispatcherFor(project: Project): Dispatcher<Project> {
  const registry = new CommandRegistry<Project>()
  registerSiteCommands(registry)
  return new Dispatcher<Project>(project, registry)
}

describe('setSiteLocation', () => {
  it('records a lat/long', () => {
    const project = newProject()
    dispatcherFor(project).dispatch(setSiteLocation({ latitude: 42.36, longitude: -71.06 }))
    expect(project.site?.latLong).toEqual({ latitude: 42.36, longitude: -71.06 })
  })

  it('restores an absent site on undo when none existed before', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setSiteLocation({ latitude: 42.36, longitude: -71.06 }))
    dispatcher.undo()
    expect(project.site).toBeUndefined()
  })
})

describe('setSiteNorthBearing', () => {
  it('records the north bearing in radians', () => {
    const project = newProject()
    dispatcherFor(project).dispatch(setSiteNorthBearing(0.5))
    expect(project.site?.northBearing).toBe(0.5)
  })
})

describe('addObstruction', () => {
  it('appends a top-down massing obstruction', () => {
    const project = newProject()
    dispatcherFor(project).dispatch(addObstruction(OBSTRUCTION))
    expect(project.site?.obstructions?.[0]).toEqual(OBSTRUCTION)
  })

  it('removes a named obstruction', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(addObstruction(OBSTRUCTION))
    dispatcher.dispatch(removeObstruction('tree-1'))
    expect(project.site?.obstructions ?? []).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/commands/handlers/site-commands.test.ts`
Expected: FAIL, cannot resolve module `./site-commands` (and `Project.site` does not exist).

Commit: `git add core/commands/handlers/site-commands.test.ts core/model/types.ts core/model/site.ts && git commit -m "test: set site location, bearing, and obstructions through commands"`

### GREEN

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

Create `core/model/site.ts`:

```typescript
import type { Point } from './types'

/** A geographic location in decimal degrees. */
export interface LatLong {
  latitude: number
  longitude: number
}

/**
 * A top-down massing footprint of a nearby structure or tree, with a height.
 * A non-rendering placeholder (design spec 3.1 and Phase 6); the Phase-8 solar
 * lighting provider would later consume these for obstruction shadows.
 */
export interface Obstruction {
  id: string
  /** Footprint polygon in the plan frame, in world millimeters. */
  footprint: Point[]
  /** Massing height in millimeters. */
  height: number
}

/** Optional project site metadata (design spec 3.1). */
export interface Site {
  latLong?: LatLong
  /** Angle from plan-up to true north, in radians (matching UnderlayPlacement.rotation). */
  northBearing?: number
  obstructions?: Obstruction[]
}
```

Add the field to `Project` in `core/model/types.ts` (import `Site` from `./site`):

```typescript
import type { Site } from './site'

export interface Project {
  meta: ProjectMeta
  floors: Floor[]
  roomOverrides?: Record<string, RoomOverride> | undefined
  palettes?: ProjectPalette[] | undefined
  paint?: Record<string, PaintAssignment> | undefined
  /** Optional site metadata (design spec 3.1). Absent means none. */
  site?: Site | undefined
}
```

Create `core/commands/handlers/site-commands.ts`. Each handler reassigns the whole `site` slice (a fresh `Site` object merging the change over the prior one), so the inverse-capture proxy records the root-level change and undo restores the prior `site` reference, including back to absent.

```typescript
import type { LatLong, Obstruction, Site } from '../../model/site'
import type { Project } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const SET_SITE_LOCATION = 'site/set-location'
export const SET_SITE_NORTH_BEARING = 'site/set-north-bearing'
export const ADD_OBSTRUCTION = 'site/add-obstruction'
export const REMOVE_OBSTRUCTION = 'site/remove-obstruction'

export interface SetSiteLocationParams {
  latLong: LatLong
}
export function setSiteLocation(latLong: LatLong): Command<SetSiteLocationParams> {
  return { type: SET_SITE_LOCATION, params: { latLong }, description: 'Set site location' }
}
const setSiteLocationHandler: CommandHandler<Project, SetSiteLocationParams> = {
  apply(state, params) {
    state.site = { ...state.site, latLong: params.latLong }
  },
}
```

Add `setSiteNorthBearing(radians)` (sets `state.site = { ...state.site, northBearing }`), `addObstruction(obstruction)` (sets `state.site = { ...state.site, obstructions: [...(state.site?.obstructions ?? []), obstruction] }`), and `removeObstruction(id)` (filters `obstructions`). Register all four in `registerSiteCommands`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/commands/handlers/site-commands.test.ts`
Expected: PASS.

Commit: `git add core/model/site.ts core/model/types.ts core/commands/handlers/site-commands.ts && git commit -m "feat: set site location, bearing, and obstructions through commands"`

### BLUE

- [ ] **Step 5: Review and marker commit.** Watch `max-lines` on `site-commands.ts`. Land: `git commit --allow-empty -m "refactor: tidy the site commands"`.

---

## Cycle 10: A saved project round-trips the new palettes, paint, and site fields through a schema migration

**Files:**

- Modify: `core/model/factories.ts` (bump `CURRENT_SCHEMA_VERSION`)
- Create: `core/migrations/schema/add-palettes-paint-and-site.ts`
- Modify: `core/migrations/schema/index.ts`
- Test: `core/migrations/schema/add-palettes-paint-and-site.test.ts`

The new fields are all optional top-level fields, so the migration is structural pass-through (absent is treated identically to present-but-undefined); the version bump is what records that this build understands them. Read `add-period-and-style.test.ts` for the exact `from`/`migrate` assertion style before writing.

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Create `core/migrations/schema/add-palettes-paint-and-site.test.ts`.

**Test name:** `add-palettes-paint-and-site schema migration` > `passes a prior-version document through unchanged and does not bump its own version`
**Assertion:** the migration's `from` equals the prior `CURRENT_SCHEMA_VERSION` (5); a document at that version with no `palettes`, `paint`, or `site` passes through structurally unchanged; the migration does not invent any of the three fields; and it does not set `meta.schemaVersion` itself (the orchestrator advances it).

```typescript
import { describe, expect, it } from 'vitest'
import type { ProjectShape } from '../../index'
import { addPalettesPaintAndSiteMigration } from './add-palettes-paint-and-site'

function priorDocument(): ProjectShape {
  return {
    meta: {
      name: 'P',
      units: 'imperial',
      period: 'victorian',
      schemaVersion: addPalettesPaintAndSiteMigration.from,
      appVersion: '0.1.0',
      registryVersions: {},
    },
    floors: [],
  } as unknown as ProjectShape
}

describe('add-palettes-paint-and-site schema migration', () => {
  it('starts from the prior current schema version', () => {
    expect(addPalettesPaintAndSiteMigration.from).toBe(5)
  })

  it('passes a document without the new fields through unchanged', () => {
    const before = priorDocument()
    const migrated = addPalettesPaintAndSiteMigration.migrate(priorDocument())
    expect(migrated).toEqual(before)
  })

  it('does not invent palettes, paint, or site', () => {
    const migrated = addPalettesPaintAndSiteMigration.migrate(priorDocument()) as Record<
      string,
      unknown
    >
    expect('palettes' in migrated).toBe(false)
    expect('paint' in migrated).toBe(false)
    expect('site' in migrated).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/migrations/schema/add-palettes-paint-and-site.test.ts`
Expected: FAIL, cannot resolve module `./add-palettes-paint-and-site`.

Commit: `git add core/migrations/schema/add-palettes-paint-and-site.test.ts && git commit -m "test: migrate a project to carry palettes, paint, and site"`

### GREEN

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

Bump `CURRENT_SCHEMA_VERSION` from 5 to 6 in `core/model/factories.ts` and extend the version-history comment:

```typescript
// v2 introduces the optional top-level `roomOverrides` map; v3 adds the
// per-floor `openings` array; v4 adds the per-floor `dimensions` array; v5
// renames the project `era` field to `period`, adds the optional project
// `style`, and adds the optional per-floor `periodOverride` and `styleOverride`;
// v6 adds the optional top-level `palettes`, `paint`, and `site` fields (all
// absent-by-default, so the migration is a structural pass-through).
export const CURRENT_SCHEMA_VERSION = 6
```

Create `core/migrations/schema/add-palettes-paint-and-site.ts`:

```typescript
import type { SchemaMigration } from '../types'

/**
 * Migrates a version-5 document forward to version 6. Version 6 adds the optional
 * top-level `palettes`, `paint`, and `site` fields. All three are
 * absent-by-default, and an absent optional field is treated identically to an
 * unset one, so no data work is needed: the migration is a structural
 * pass-through. The version bump records that this build understands the fields.
 * The orchestrator advances `meta.schemaVersion`, so the migration must not.
 */
export const addPalettesPaintAndSiteMigration: SchemaMigration = {
  from: 5,
  migrate(project) {
    return project
  },
}
```

Append it to `core/migrations/schema/index.ts`:

```typescript
import { addPalettesPaintAndSiteMigration } from './add-palettes-paint-and-site'

export const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = [
  addRoomOverridesMigration,
  addFloorOpeningsMigration,
  addFloorDimensionsMigration,
  addPeriodAndStyleMigration,
  addPalettesPaintAndSiteMigration,
]
```

- [ ] **Step 4: Run the test plus the existing migration and factory suites to verify they pass**

Run: `pnpm exec vitest run core/migrations core/model/factories.test.ts`
Expected: PASS. The `createEmptyProject` test asserts `schemaVersion === CURRENT_SCHEMA_VERSION`, so it tracks the bump automatically. Confirm the full `migrateProject` chain promotes a version-5 document to version 6, and that no existing migration test hardcoded the old target version.

Commit: `git add core/model/factories.ts core/migrations/schema/add-palettes-paint-and-site.ts core/migrations/schema/index.ts && git commit -m "feat: migrate a project to carry palettes, paint, and site"`

### BLUE

- [ ] **Step 5: Review and marker commit.** The pass-through migration is intentionally trivial; the WHY comment explains it. Land: `git commit --allow-empty -m "refactor: tidy the palettes, paint, and site migration"`.

---

## Cycle 11: The public core API surface exports the color module, palette registry, paint model, and site model

**Files:**

- Modify: `core/index.ts`
- Test: `core/index.test.ts` (extend if it exists from a prior track, else create)

This cycle has no new domain behavior; it pins the public surface so the editor pickers and the bridge import from `core/` rather than reaching into module paths. All edits are append-only.

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Add a focused barrel test (extend `core/index.test.ts` if a prior track created it; otherwise create it importing from `'./index'`).

**Test name:** `core barrel` > `re-exports the color, palette, paint, and site surface`
**Assertion:** importing from the core barrel yields `colorFromHex`, `srgbToOkLab`, `mixColors`, `nearestColor`, `builtinPalettes`, `surfaceKey`, `resolveSurfacePaint`, and the new commands (`assignSurfacePaint`, `clearSurfacePaint`, `createProjectPalette`, `addPaletteColor`, `setSiteLocation`, `addObstruction`) as defined values.

```typescript
import { describe, expect, it } from 'vitest'
import {
  addObstruction,
  addPaletteColor,
  assignSurfacePaint,
  builtinPalettes,
  clearSurfacePaint,
  colorFromHex,
  createProjectPalette,
  mixColors,
  nearestColor,
  resolveSurfacePaint,
  setSiteLocation,
  srgbToOkLab,
  surfaceKey,
} from './index'

describe('core barrel', () => {
  it('re-exports the color, palette, paint, and site surface', () => {
    expect(builtinPalettes.version).toBeGreaterThan(0)
    for (const fn of [
      colorFromHex,
      srgbToOkLab,
      mixColors,
      nearestColor,
      surfaceKey,
      resolveSurfacePaint,
      assignSurfacePaint,
      clearSurfacePaint,
      createProjectPalette,
      addPaletteColor,
      setSiteLocation,
      addObstruction,
    ]) {
      expect(typeof fn).toBe('function')
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/index.test.ts`
Expected: FAIL, the named exports are not found on the barrel.

Commit: `git add core/index.test.ts && git commit -m "test: pin the color, palette, paint, and site public API surface"`

### GREEN

- [ ] **Step 3: Add the exports (implementer, `/implement`)**

Append to `core/index.ts` (append-only; group with the existing registry, command, and model exports):

```typescript
export type { OkLab, Srgb, LinearRgb } from './color/oklab'
export { srgbToOkLab, okLabToSrgb, srgbToLinear, linearToSrgb } from './color/oklab'
export { parseHex, formatHex } from './color/hex'
export type { Color, NamedColor } from './color/color'
export { colorFromHex, colorFromOkLab } from './color/color'
export { mixColors, perceptualDistance, nearestColor } from './color/operations'
export type { Palette } from './registries/palettes'
export { PALETTE_REGISTRY_VERSION, builtinPalettes } from './registries/palettes'
export type { ProjectPalette } from './model/types'
export type { SurfaceRef, PaintAssignment } from './model/paint'
export { surfaceKey } from './model/paint'
export { resolveSurfacePaint } from './paint/resolve-surface-paint'
export type { LatLong, Obstruction, Site } from './model/site'
export type {
  CreateProjectPaletteParams,
  AddPaletteColorParams,
} from './commands/handlers/palette-commands'
export {
  CREATE_PROJECT_PALETTE,
  REMOVE_PROJECT_PALETTE,
  RENAME_PROJECT_PALETTE,
  ADD_PALETTE_COLOR,
  REMOVE_PALETTE_COLOR,
  addPaletteColor,
  createProjectPalette,
  registerPaletteCommands,
  removePaletteColor,
  removeProjectPalette,
  renameProjectPalette,
} from './commands/handlers/palette-commands'
export type {
  AssignSurfacePaintParams,
  ClearSurfacePaintParams,
} from './commands/handlers/paint-commands'
export {
  ASSIGN_SURFACE_PAINT,
  CLEAR_SURFACE_PAINT,
  assignSurfacePaint,
  clearSurfacePaint,
  registerPaintCommands,
} from './commands/handlers/paint-commands'
export type {
  SetSiteLocationParams,
  SetSiteNorthBearingParams,
  AddObstructionParams,
  RemoveObstructionParams,
} from './commands/handlers/site-commands'
export {
  ADD_OBSTRUCTION,
  REMOVE_OBSTRUCTION,
  SET_SITE_LOCATION,
  SET_SITE_NORTH_BEARING,
  addObstruction,
  registerSiteCommands,
  removeObstruction,
  setSiteLocation,
  setSiteNorthBearing,
} from './commands/handlers/site-commands'
```

(Adjust the exact `Params` type names to match whatever the implementer named them in cycles 5, 7, and 9; the function and constant names are the contract.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/index.test.ts`
Expected: PASS.

Commit: `git add core/index.ts && git commit -m "feat: export the color, palette, paint, and site public API surface"`

### BLUE

- [ ] **Step 5: Review and marker commit.** The `max-lines` rule on the barrel is already disabled at the top of `core/index.ts`. Land: `git commit --allow-empty -m "refactor: tidy the core barrel exports"`.

---

## Cycle 12: The finish picker lists the finishes and dispatches the chosen one

**Files:**

- Create: `editor/paint/finish-picker.tsx`
- Test: `editor/paint/finish-picker.test.tsx`

Group B begins. This component mirrors `editor/plan/room-name-editor.tsx`: a `dispatch` prop, presentational, importing from the `core/` barrel and `editor/design-system`.

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Create `editor/paint/finish-picker.test.tsx`, mirroring `editor/plan/room-name-editor.test.tsx`.

**Test name:** `FinishPicker` > `lists the six finishes and dispatches an assignment for the chosen finish`
**Assertion:** the picker renders an option for each of the six `builtinFinishes`; the current finish is shown selected; choosing a different finish calls `dispatch` once with an `assignSurfacePaint` command carrying the chosen finish id and the surface's existing color (re-assigning the surface with the new finish is how a finish change is recorded, since a paint assignment pairs a color and a finish).

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { assignSurfacePaint, colorFromHex, type Command, type SurfaceRef } from '../../core'
import { FinishPicker } from './finish-picker'

const REF: SurfaceRef = { kind: 'wall-face', wallId: 'wall-1', side: 'left' }
const COLOR = colorFromHex('#9aa583')

afterEach(cleanup)

describe('FinishPicker', () => {
  it('lists the six finishes', () => {
    render(<FinishPicker surface={REF} color={COLOR} finishId="matte" dispatch={vi.fn()} />)
    expect(screen.getAllByRole('radio')).toHaveLength(6)
  })

  it('dispatches an assignment with the chosen finish and the existing color', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    render(<FinishPicker surface={REF} color={COLOR} finishId="matte" dispatch={dispatch} />)

    await user.click(screen.getByRole('radio', { name: /satin/i }))

    const expected = assignSurfacePaint(REF, COLOR, 'satin')
    const sent = dispatch.mock.calls[0]?.[0] as Command
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(sent.type).toBe(expected.type)
    expect(sent.params).toEqual(expected.params)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/paint/finish-picker.test.tsx`
Expected: FAIL, cannot resolve module `./finish-picker`.

Commit: `git add editor/paint/finish-picker.test.tsx && git commit -m "test: pick a finish and dispatch the surface assignment"`

### GREEN

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

Create `editor/paint/finish-picker.tsx`. Render a radio group over `builtinFinishes`, label each by its finish id (a display-name map is a later i18n cycle), and dispatch `assignSurfacePaint(surface, color, finishId)` on change. Accessible color name is the color picker's concern (cycle 13); the finish picker labels finishes by name.

```typescript
import { assignSurfacePaint, builtinFinishes, type Color, type SurfaceRef } from '../../core'

export interface FinishPickerProps {
  surface: SurfaceRef
  color: Color
  finishId: string
  dispatch: (command: ReturnType<typeof assignSurfacePaint>) => void
}

export function FinishPicker({ surface, color, finishId, dispatch }: FinishPickerProps) {
  return (
    <fieldset>
      <legend>Finish</legend>
      {Object.keys(builtinFinishes.entries).map((id) => (
        <label key={id}>
          <input
            type="radio"
            name="finish"
            value={id}
            checked={id === finishId}
            onChange={() => dispatch(assignSurfacePaint(surface, color, id))}
          />
          {id}
        </label>
      ))}
    </fieldset>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/paint/finish-picker.test.tsx`
Expected: PASS.

Commit: `git add editor/paint/finish-picker.tsx && git commit -m "feat: pick a finish and dispatch the surface assignment"`

### BLUE

- [ ] **Step 5: Review and marker commit.** Watch `max-lines-per-function` (40) on the component. The radio-group accessibility (an accessible `name` via the legend and labels) is the right pattern (design spec 6.13). Land: `git commit --allow-empty -m "refactor: tidy the finish picker"`.

---

## Cycle 13: The color picker browses palettes, surfaces recent colors, fuzzy-searches by name, and dispatches the chosen color

This cycle is two behaviors; run the fuzzy search helper first (pure, fast) and the component second. Both are shown as sub-cycles.

**Files:**

- Create: `editor/paint/color-name-search.ts`
- Create: `editor/paint/color-picker.tsx`
- Test: `editor/paint/color-name-search.test.ts`
- Test: `editor/paint/color-picker.test.tsx`

### RED (sub-cycle 13a: fuzzy color-name search)

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Create `editor/paint/color-name-search.test.ts`.

**Test name:** `searchColorNames` > `ranks named colors by a fuzzy match on the query`
**Assertion:** given named colors `['Sage Green', 'Slate Blue', 'Warm White']`, `searchColorNames('sage', candidates)` returns `Sage Green` first; an empty query returns all candidates in their original order; a query matching nothing returns an empty list.

```typescript
import { describe, expect, it } from 'vitest'
import { searchColorNames } from './color-name-search'
import { colorFromHex, type NamedColor } from '../../core'

const CANDIDATES: NamedColor[] = [
  { name: 'Sage Green', color: colorFromHex('#9aa583') },
  { name: 'Slate Blue', color: colorFromHex('#5b6e7a') },
  { name: 'Warm White', color: colorFromHex('#f4efe6') },
]

describe('searchColorNames', () => {
  it('ranks a matching color first', () => {
    expect(searchColorNames('sage', CANDIDATES)[0]?.name).toBe('Sage Green')
  })

  it('returns every candidate for an empty query', () => {
    expect(searchColorNames('', CANDIDATES)).toHaveLength(CANDIDATES.length)
  })

  it('returns nothing for a query that matches no name', () => {
    expect(searchColorNames('zzz', CANDIDATES)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/paint/color-name-search.test.ts`
Expected: FAIL, cannot resolve module `./color-name-search`.

Commit: `git add editor/paint/color-name-search.test.ts && git commit -m "test: fuzzy-rank color names by query"`

### GREEN (sub-cycle 13a)

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

Create `editor/paint/color-name-search.ts`. A minimal case-insensitive subsequence-or-substring filter is enough for the named behavior; rank exact substring matches ahead of looser ones. Keep it pure so it is fast and testable.

```typescript
import type { NamedColor } from '../../core'

/** Case-insensitive ranked search of named colors. Empty query returns all, in order. */
export function searchColorNames(query: string, candidates: readonly NamedColor[]): NamedColor[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) {
    return [...candidates]
  }
  return candidates
    .map((candidate) => ({ candidate, index: candidate.name.toLowerCase().indexOf(needle) }))
    .filter((scored) => scored.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map((scored) => scored.candidate)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/paint/color-name-search.test.ts`
Expected: PASS.

Commit: `git add editor/paint/color-name-search.ts && git commit -m "feat: fuzzy-rank color names by query"`

### BLUE (sub-cycle 13a)

- [ ] **Step 5: Review and marker commit.** Land: `git commit --allow-empty -m "refactor: tidy the color-name search"`.

### RED (sub-cycle 13b: the color picker component)

- [ ] **Step 6: Write the failing test (test-author, `/test-first`)**

Create `editor/paint/color-picker.test.tsx`.

**Test name:** `ColorPicker` > `browses palette colors, shows recent, searches by name, and dispatches the chosen color`
**Assertion:** the picker renders a chip for each bundled-palette color, each chip carrying its accessible color name as text (design spec 7.4); a recent-colors strip renders the passed-in `recent` colors; typing in the name search filters the chips; clicking a chip calls `dispatch` once with an `assignSurfacePaint` command carrying the chosen color and the surface's current finish.

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  assignSurfacePaint,
  builtinPalettes,
  colorFromHex,
  type Command,
  type SurfaceRef,
} from '../../core'
import { ColorPicker } from './color-picker'

const REF: SurfaceRef = { kind: 'floor', floorId: 'floor-1' }
const RECENT = [colorFromHex('#6e2b2b', 'Oxblood')]
const FIRST_PALETTE = Object.values(builtinPalettes.entries)[0]!
const FIRST_COLOR = FIRST_PALETTE.colors[0]!

afterEach(cleanup)

describe('ColorPicker', () => {
  it('shows every palette color with its accessible name', () => {
    render(<ColorPicker surface={REF} finishId="matte" recent={RECENT} dispatch={vi.fn()} />)
    expect(screen.getByText(FIRST_COLOR.name)).toBeInTheDocument()
  })

  it('dispatches an assignment for the chosen color carrying the current finish', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    render(<ColorPicker surface={REF} finishId="matte" recent={RECENT} dispatch={dispatch} />)

    await user.click(screen.getByRole('button', { name: FIRST_COLOR.name }))

    const expected = assignSurfacePaint(REF, FIRST_COLOR.color, 'matte')
    const sent = dispatch.mock.calls[0]?.[0] as Command
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(sent.type).toBe(expected.type)
    expect(sent.params).toEqual(expected.params)
  })

  it('filters the palette chips by the name search', async () => {
    const user = userEvent.setup()
    render(<ColorPicker surface={REF} finishId="matte" recent={RECENT} dispatch={vi.fn()} />)

    await user.type(screen.getByLabelText(/search/i), FIRST_COLOR.name)

    expect(screen.getByText(FIRST_COLOR.name)).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/paint/color-picker.test.tsx`
Expected: FAIL, cannot resolve module `./color-picker`.

Commit: `git add editor/paint/color-picker.test.tsx && git commit -m "test: browse palettes, search names, and dispatch the chosen color"`

### GREEN (sub-cycle 13b)

- [ ] **Step 8: Write the minimal implementation (implementer, `/implement`)**

Create `editor/paint/color-picker.tsx`. Flatten the bundled palettes into named colors, filter them through `searchColorNames`, render each as a `button` whose accessible name is the color name and whose swatch is a background set from `color.srgbHex`, render the `recent` strip the same way, and dispatch `assignSurfacePaint(surface, color, finishId)` on click. Build on the design-system `Stack` for layout.

```typescript
import { useState } from 'react'
import {
  assignSurfacePaint,
  builtinPalettes,
  type Color,
  type NamedColor,
  type SurfaceRef,
} from '../../core'
import { Stack } from '../design-system'
import { searchColorNames } from './color-name-search'

export interface ColorPickerProps {
  surface: SurfaceRef
  finishId: string
  recent: Color[]
  dispatch: (command: ReturnType<typeof assignSurfacePaint>) => void
}

function paletteColors(): NamedColor[] {
  return Object.values(builtinPalettes.entries).flatMap((palette) => palette.colors)
}

export function ColorPicker({ surface, finishId, recent, dispatch }: ColorPickerProps) {
  const [query, setQuery] = useState('')
  const matches = searchColorNames(query, paletteColors())

  function choose(color: Color) {
    dispatch(assignSurfacePaint(surface, color, finishId))
  }

  return (
    <Stack>
      <label>
        Search colors
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <Stack direction="horizontal">
        {matches.map((named) => (
          <button
            type="button"
            key={named.name}
            aria-label={named.name}
            style={{ background: named.color.srgbHex }}
            onClick={() => choose(named.color)}
          >
            {named.name}
          </button>
        ))}
      </Stack>
      <Stack direction="horizontal">
        {recent.map((color) => (
          <button
            type="button"
            key={color.srgbHex}
            aria-label={color.originalSpec ?? color.srgbHex}
            style={{ background: color.srgbHex }}
            onClick={() => choose(color)}
          >
            {color.originalSpec ?? color.srgbHex}
          </button>
        ))}
      </Stack>
    </Stack>
  )
}
```

(If `max-lines-per-function` (40) flags the component, the refactorer extracts a `ColorChip` sub-component in the BLUE phase; the test pins behavior, not structure.)

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/paint/color-picker.test.tsx`
Expected: PASS.

Commit: `git add editor/paint/color-picker.tsx && git commit -m "feat: browse palettes, search names, and dispatch the chosen color"`

### BLUE (sub-cycle 13b)

- [ ] **Step 10: Review and marker commit.** The likely finding is `max-lines-per-function`; extract a `ColorChip` component if so. Confirm every chip carries an accessible name (design spec 7.4 and 6.13). Land: `git commit --allow-empty -m "refactor: tidy the color picker"`.

---

## Cycle 14: The site editor authors the location, north bearing, and obstructions

**Files:**

- Create: `editor/metadata/site-editor.tsx`
- Test: `editor/metadata/site-editor.test.tsx`

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Create `editor/metadata/site-editor.test.tsx`.

**Test name:** `SiteEditor` > `shows the current site and dispatches a location update`
**Assertion:** the editor shows the current `latLong` in labeled latitude and longitude inputs; committing a changed latitude/longitude calls `dispatch` once with a `setSiteLocation` command carrying the new lat/long. (A second test covers dispatching `setSiteNorthBearing` from a bearing input.)

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setSiteLocation, type Command, type Site } from '../../core'
import { SiteEditor } from './site-editor'

const SITE: Site = { latLong: { latitude: 42.36, longitude: -71.06 } }

afterEach(cleanup)

describe('SiteEditor', () => {
  it('shows the current latitude and longitude', () => {
    render(<SiteEditor site={SITE} dispatch={vi.fn()} />)
    expect(screen.getByLabelText(/latitude/i)).toHaveValue(42.36)
    expect(screen.getByLabelText(/longitude/i)).toHaveValue(-71.06)
  })

  it('dispatches a location update when the coordinates are committed', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    render(<SiteEditor site={SITE} dispatch={dispatch} />)

    const latitude = screen.getByLabelText(/latitude/i)
    await user.clear(latitude)
    await user.type(latitude, '40{Enter}')

    const sent = dispatch.mock.calls[0]?.[0] as Command
    expect(sent.type).toBe(setSiteLocation({ latitude: 40, longitude: -71.06 }).type)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/metadata/site-editor.test.tsx`
Expected: FAIL, cannot resolve module `./site-editor`.

Commit: `git add editor/metadata/site-editor.test.tsx && git commit -m "test: author site location through the site editor"`

### GREEN

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

Create `editor/metadata/site-editor.tsx`, mirroring `room-name-editor.tsx`: controlled number inputs for latitude and longitude (and a bearing input), committing on Enter by dispatching `setSiteLocation` / `setSiteNorthBearing`. The obstruction list may render the existing obstructions with a remove control wired to `removeObstruction`; adding an obstruction is a later cycle if the focused test does not pin it (keep this GREEN minimal to what the test asserts).

```typescript
import { useState, type KeyboardEvent } from 'react'
import { setSiteLocation, type Site } from '../../core'
import { Stack } from '../design-system'

export interface SiteEditorProps {
  site: Site
  dispatch: (command: ReturnType<typeof setSiteLocation>) => void
}

export function SiteEditor({ site, dispatch }: SiteEditorProps) {
  const [latitude, setLatitude] = useState(site.latLong?.latitude ?? 0)
  const [longitude, setLongitude] = useState(site.latLong?.longitude ?? 0)

  function commit() {
    dispatch(setSiteLocation({ latitude, longitude }))
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      commit()
    }
  }

  return (
    <Stack>
      <label>
        Latitude
        <input
          type="number"
          value={latitude}
          onChange={(event) => setLatitude(event.target.valueAsNumber)}
          onKeyDown={onKeyDown}
        />
      </label>
      <label>
        Longitude
        <input
          type="number"
          value={longitude}
          onChange={(event) => setLongitude(event.target.valueAsNumber)}
          onKeyDown={onKeyDown}
        />
      </label>
    </Stack>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/metadata/site-editor.test.tsx`
Expected: PASS.

Commit: `git add editor/metadata/site-editor.tsx && git commit -m "feat: author site location through the site editor"`

### BLUE

- [ ] **Step 5: Review and marker commit.** Watch `max-lines-per-function` (40); if adding the bearing and obstruction controls pushes the component over, extract sub-components. Land: `git commit --allow-empty -m "refactor: tidy the site editor"`.

---

## Cycle 15: The editor public surface exports the pickers and the site editor

**Files:**

- Modify: `editor/index.ts`
- Test: `editor/index.test.ts` (create; no current editor test imports from the barrel)

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Create `editor/index.test.ts`.

**Test name:** `editor barrel` > `re-exports the paint pickers and the site editor`
**Assertion:** importing from the editor barrel yields `FinishPicker`, `ColorPicker`, and `SiteEditor` as functions.

```typescript
import { describe, expect, it } from 'vitest'
import { ColorPicker, FinishPicker, SiteEditor } from './index'

describe('editor barrel', () => {
  it('re-exports the paint pickers and the site editor', () => {
    for (const component of [FinishPicker, ColorPicker, SiteEditor]) {
      expect(typeof component).toBe('function')
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/index.test.ts`
Expected: FAIL, the named exports are not found.

Commit: `git add editor/index.test.ts && git commit -m "test: pin the paint and metadata editor surface"`

### GREEN

- [ ] **Step 3: Add the exports (implementer, `/implement`)**

Append to `editor/index.ts`:

```typescript
export { FinishPicker } from './paint/finish-picker'
export type { FinishPickerProps } from './paint/finish-picker'
export { ColorPicker } from './paint/color-picker'
export type { ColorPickerProps } from './paint/color-picker'
export { SiteEditor } from './metadata/site-editor'
export type { SiteEditorProps } from './metadata/site-editor'
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/index.test.ts`
Expected: PASS.

Commit: `git add editor/index.ts && git commit -m "feat: export the paint and metadata editor surface"`

### BLUE

- [ ] **Step 5: Review and marker commit.** Land: `git commit --allow-empty -m "refactor: tidy the editor barrel exports"`.

---

## Final verification (before opening the PR)

- [ ] **Run the full check chain.**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all green. The lint step is the strict gate (warnings count; watch `no-magic-numbers` on the OKLab matrices and the hex constants, `max-lines` on `palette-commands.ts` and `site-commands.ts`, and `max-lines-per-function` on the React components, per the ESLint gotchas memo).

- [ ] **Confirm the commit sequence per cycle is test then feat then refactor** (the rgb:audit rule). Each cycle (and each sub-cycle) must show that triple, with the refactor commit possibly empty. Use `origin/main..HEAD` as the audit range (the merging-parallel-worktree-slices memo: the default range can use a stale local main).

- [ ] **PR-level review.** Run `/review` (the pr-reviewer) before merge. (The push/PR/GitHub hold may still be active; produce the audit locally and hold the PR until the hold lifts.)

- [ ] **Knowledge curation.** This track establishes the `core/color/` OKLab module and the three-form `Color` value, the `PaletteRegistry` and the project-local palette model, the surface paint-assignment model with its `SurfaceRef` addressing scheme, and the site model. That is an architectural unit worth one ADR. After the work lands, write an ADR under `docs/knowledge/decisions/` recording: the centralized `core/color/` OKLab representation and the three-form `Color` (design spec 7.4); the `PaletteRegistry` extending ADR-0006 and the split between the bundled registry and the project-local `Project.palettes[]`; the `SurfaceRef` addressing scheme chosen because the scene graph does not yet model surface nodes, and the contract that the three-dimensional track's future surface nodes carry the same `SurfaceRef` so the painted preview reads this store; the paint store on `Project.paint` and its commands; the site model; and the explicit deferral of the painted three-dimensional preview behind the three-dimensional render seam (ADR-0044, ADR-0045). The model is additive to the design specification (it implements sections 3.1, 6.8, and 7.4 as written) rather than diverging, so no spec edit is required; the ADR records the realized shapes and the deferral.

---

## Merge-coordination summary for the orchestrator

Files in this track shared with other Phase-2 tracks, to sequence at merge time:

1. **`core/model/types.ts`**: this track adds three optional top-level `Project` fields (`palettes?`, `paint?`, `site?`) and the `ProjectPalette` interface, and imports `PaintAssignment` from `./paint` and `Site` from `./site`. All edits are additive (new optional fields, new imports). **The structure/multi-floor track also reads and may extend `Project` and `Floor` in this file** (floor management, per-room ceiling-height override, stair topology). No shared field becomes required (per the required-shared-field memo, the breakage risk is only when a shared member becomes required, which this track avoids). Sequence the merges and re-run typecheck after each.

2. **`core/model/factories.ts`**: this track bumps `CURRENT_SCHEMA_VERSION` (5 to 6). **The structure/multi-floor track may also bump the schema version** if it adds a persisted field (for example a per-room ceiling-height override or stair topology). If both tracks bump the version, the orchestrator must reconcile to a single linear chain: pick one final version number, renumber the later migration's `from`/target, and order the two migrations in `SCHEMA_MIGRATIONS` consistently. This is the most likely real conflict; merge the schema-touching tracks one at a time and re-run the full migration suite after each.

3. **`core/migrations/schema/index.ts`**: append-only (this track appends `addPalettesPaintAndSiteMigration`). If the structure track also appends a migration, reconcile the `from` values into one contiguous chain (see point 2).

4. **`core/index.ts`**: append-only barrel edits; merge cleanly. Re-run typecheck after each merge.

5. **`editor/index.ts`**: append-only barrel edits. **The app-layout-shell track also edits `editor/index.ts`** (it composes the panels, including, eventually, the pickers and the site editor into a layout). Append-only here; the layout-shell track is the natural consumer that mounts these components into a panel, so coordinate so the layout track imports the exports this track adds. Re-run typecheck after each merge.

All other new files (`core/color/*`, `core/registries/palettes.ts`, `core/model/paint.ts`, `core/model/site.ts`, `core/paint/*`, the three command-handler files and their tests, the migration file, and the four `editor/` components and their tests) are owned by this track and are unlikely to collide.

**A note on the `NamedColor` home (internal sequencing, not a cross-track concern):** `NamedColor` (a name plus a `Color`) is defined once in `core/color/color.ts` in cycle 2, so the palette registry (cycle 4) and the `ProjectPalette` model field (cycle 5) both import it from there. This fixes the import direction as `core/registries` and `core/model` both depending on `core/color`, with no `core/model -> core/registries` cycle. The orchestrator must therefore land cycle 2 before cycles 4 and 5 (it already precedes them in the color sub-stream). The barrel re-exports `NamedColor` from `./color/color` in cycle 11.
