# Period, Style, and Room-Purpose Registries Implementation Plan

> **For agentic workers:** This plan is executed with the project's red-green-blue (RGB) TDD discipline, one behavior per cycle. The orchestrator dispatches the role-separated subagents from the main thread: `/test-first` (test-author, RED), `/implement` (implementer, GREEN), `/clean-code-review` then `/refactor` (BLUE). Each cycle closes with a `refactor:` commit, possibly empty (see `.claude/rules.md` rule 14 and the rgb:audit commit-sequence rules). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first pure-`core/` data layer of the old-house vocabulary track. The single "era" concept the design specification describes is realized here as two complementary registries: a **Period registry** (the chronological era a house was built in) and a **Style registry** (the architectural style, with academic and vernacular categories and a vernacular-variant modifier). A **Room-Purpose registry** carries the room's primary purpose, with an optional free-text sub-purpose. All of this ships with a minimal tagging model and the undoable dispatch commands that set the tags.

**Relationship to the design specification (read before starting):** Section 3.2 and the section 4.4 registry list describe a single `EraRegistry` and a single `era` field resolving `room.eraOverride ?? floor.eraOverride ?? project.era`. The product owner has approved splitting that single concept into a Period registry and a Style registry, and adding vernacular variants. This plan implements that split. It is an additive realization of the same resolution hierarchy, applied independently to period and to style. The divergence from the spec's single-`EraRegistry` wording is recorded as a follow-on ADR in the final knowledge-curation step (the spec text itself is not edited inside this slice; per the project rules a spec change rides with an ADR, and that ADR is the curation deliverable here).

**Architecture:** Three new versioned registries seeded with the MVP vocabulary live in `core/registries/`, each mirroring `finishes.ts`. The existing `project.meta.era` field becomes the project-level period (renamed in the model to `period`, an additive-and-renaming change handled by a schema migration). Period and style each resolve through the same project/floor/room override hierarchy: project default, then a per-floor override, then a per-room override. Style additionally carries an optional vernacular modifier. Room purpose is a registry id plus an optional free-text `subPurpose`, both stored on the existing `RoomOverride`. Every mutation is an undoable command through the existing dispatch boundary, mirroring `project-commands.ts` and `room-commands.ts`. Pure `resolvePeriod` and `resolveStyle` helpers compute effective values from the hierarchy without storing them.

**Tech Stack:** TypeScript, Vitest, the existing `core/registries/registry.ts` generic registry, the existing `Dispatcher` and `CommandRegistry`, and the existing schema-migration chain in `core/migrations/`.

---

## Scope and boundaries

### In scope (this slice)

This is the smallest valuable, independently shippable unit of the old-house vocabulary track. It is pure `core/` plus 2D data only, with no dependency on the three-dimensional preview track and no dependency on any other parallel track.

1. A `PeriodRegistry` (`core/registries/periods.ts`) seeded with the MVP chronological periods, each with a display name and an approximate date range.
2. A `StyleRegistry` (`core/registries/styles.ts`) seeded with the MVP architectural styles, each declaring its `category` (`'academic' | 'vernacular'`) and, where a high style has a recognized vernacular form, a `hasVernacularVariant` flag.
3. A `RoomPurposeRegistry` (`core/registries/room-purposes.ts`) seeded with the MVP room purposes.
4. A `StyleTag` value type (`{ styleId: StyleId; vernacular?: boolean }`) so a project, floor, or room can tag a style and optionally mark it as the vernacular variant of an academic style.
5. Per-project, per-floor, and per-room period overrides; per-project, per-floor, and per-room style tags; with the commands that set and clear each.
6. Per-room `purpose` and optional `subPurpose` on the existing `RoomOverride`, with the commands that set and clear them.
7. Pure `resolvePeriod(project, floorId, roomKey?)` and `resolveStyle(project, floorId, roomKey?)` helpers implementing the documented hierarchy `room ?? floor ?? project`.
8. A schema migration advancing the project schema version for the renamed project field (`meta.era` to `meta.period`), the new `meta.style` project default, the new per-floor `periodOverride` and `styleOverride` fields, and (already inside the optional `roomOverrides` map) the new per-room period, style, purpose, and sub-purpose fields.
9. Barrel exports from `core/index.ts` for everything new.

### Explicitly NOT in this slice (referenced for sequencing only)

The heavier old-house vocabulary work lands later in the same track, after this identity front. Do not pull any of it forward:

- Curved, arched, half-round, bay, and bow opening shapes (registry additions reading shape from the element type, design spec section 2.4; this is a later cycle in the old-house track).
- The trim system and `TrimProfileRegistry`.
- Wall features, ceiling features, and floor features.
- Wall construction profiles.
- Period-aware and style-aware biasing of the library (the spec calls the room-purpose vocabulary "era-aware"; era and style biasing of the asset library is an assets-track convergence node per ADR-0044, not this data slice).
- Any UI: period pickers, style pickers, vernacular toggles, room-purpose pickers, the rooms panel surfacing, and library filtering. This slice is pure-core data and commands; the editor and bridge surfacing is a downstream cycle (filtering converges on the assets track per ADR-0044, and pickers converge on the user-experience foundation track).
- Three-dimensional rendering of anything. None of this slice touches `engine/`.
- Locale packs and non-`en-US` display names. The registries carry the locale-aware `displayName: Record<string, string>` shape (design spec section 7.2) but seed only `en-US`.

### Hard invariants this slice must hold

- `core/` imports neither React nor Three.js (rule 1). Everything here is pure TypeScript in `core/`.
- All mutations flow through `dispatch(command)` (rule 3). The registries are immutable data; the only state changes are the period, style, purpose, and sub-purpose commands.
- Conventional Commits, no `Co-Authored-By` trailers, no em-dashes in any prose, descriptive English names with no milestone or phase codes (rules 7, 8, 9, 10). Historic period names (Victorian, Edwardian, Antebellum), style names (Queen Anne, Carpenter Gothic, Foursquare, Shotgun), and room names (Parlor, Scullery, Butler's Pantry) are domain vocabulary and are expected.
- The 30-day dependency cooldown forbids any new dependency. This slice adds none.

---

## Decisions I made / open questions

These resolve the genuine forks. Each is a best-practice default chosen so the slice can proceed; revisit only if a later cycle contradicts it.

1. **The single "era" concept is realized as two registries: Period and Style.** Chronological period and architectural style are independent axes of an old house (a Foursquare can be Edwardian-period; a Colonial Revival can be Interwar). Modeling them separately is the cleanest representation and is what the product owner approved. Both axes resolve through the identical override hierarchy, so the data model and the resolvers are symmetric.

2. **The project-level period field is the renamed `meta.era`.** `ProjectMeta.era` already exists and already means "the project's era." It is renamed to `meta.period` to read truthfully now that style is a separate field, and a sibling `meta.style?: StyleTag` is added for the project-level style default. The rename plus the new field are carried by one schema migration (decision 8 below). `EraId` is renamed to `PeriodId` for the same reason.

3. **Vernacular variants: `category` on the registry entry plus an optional `vernacular` modifier on the style tag.** Styles split into academic (high) and vernacular (folk) forms. The registry entry is the authority: each `Style` entry declares `category: 'academic' | 'vernacular'`. Some vernacular forms are first-class seeded entries in their own right (`folk-victorian`, `hall-and-parlor`, `i-house`, `gabled-ell`, `shotgun`, `saltbox`), each with `category: 'vernacular'`. Separately, some academic high styles have a recognized vernacular form that is not a distinct named style (Carpenter Gothic is vernacular Gothic Revival). For those, the academic entry declares `hasVernacularVariant: true`, and a style tag referencing that entry may set `vernacular: true` to mean "the vernacular variant of this academic style." The tag shape is `StyleTag { styleId: StyleId; vernacular?: boolean }`. The `vernacular: boolean` modifier is meaningful only when the referenced entry has `hasVernacularVariant: true`; on a `category: 'vernacular'` entry or an academic entry without the flag, the modifier is ignored (a later UI cycle hides the toggle there). This keeps the registry authoritative, keeps the per-element tag a single boolean, and avoids inventing a synthetic registry id for every academic-plus-vernacular pair. **This is the chosen representation; it is pinned by the cycle-2 test.**

4. **Room purpose source: fixed registry plus OPTIONAL free-text sub-purpose.** `purpose` is a `RoomPurposeId` (a registry id string), validated at the registry boundary rather than by the type alias, mirroring how the period/style ids already work. `subPurpose` is OPTIONAL free text (an optional `string`), never required, matching the spec line "rooms[] (derived polygons; purpose, eraOverride?, subPurpose?)". A user can write "Butler's Pantry" as a sub-purpose without a registry entry, and a room can carry a purpose with no sub-purpose at all.

5. **Room metadata storage: extend `RoomOverride`, not a new structure.** The existing `RoomOverride` doc comment in `core/model/types.ts` explicitly states that `purpose`, `subPurpose`, and the era override "arrive additively with the old-house architectural vocabulary milestone." This slice is that milestone's front. The new fields (`purpose?`, `subPurpose?`, `periodOverride?`, `styleOverride?`) are optional and live in the already-optional top-level `roomOverrides` map keyed by `roomKey`, so they need no schema-version bump of their own and follow the exact merge-and-undo pattern in `room-commands.ts`.

6. **Floor fields and the project rename need a schema migration; room fields do not.** Adding `periodOverride?` and `styleOverride?` to `Floor` and renaming `meta.era` to `meta.period` (plus adding `meta.style?`) change the persisted shape, so they get one schema migration. The migration renames `meta.era` to `meta.period` when the legacy key is present and otherwise passes through (structural for floors, since absent optional fields are treated identically to present-but-undefined). The room fields ride inside the optional `roomOverrides` map whose absence is already handled, so they need no bump.

7. **Registry validation policy.** Following the existing `EraId` alias comment ("Validated at the registry boundary, not by this alias"), the command factories and handlers do not themselves reject unknown ids. The id is a string; the registry is the authority on which ids exist. A later UI cycle constrains the picker to registry ids. This matches how the element-type id on `Opening` already works.

8. **Clearing an override.** Setting a floor or room period, style, purpose, or sub-purpose to `undefined` clears it (falling back to the next level of the hierarchy). The commands accept the value-or-undefined and the handlers write the value through, so undo restores the prior value including back to absent. This mirrors the `name`-clearing semantics already proven in `room-commands.ts`.

9. **Display-name and date-range shape.** Period entries carry `displayName: Record<string, string>` and an `approximateRange: string` (a human-readable date span such as `'c. 1837-1901'`, hyphen not em-dash). Style and room-purpose entries carry `displayName: Record<string, string>`. All display names seed an `'en-US'` key only, honoring the locale-aware seam in design spec section 7.2 without building locale infrastructure now.

10. **Where the resolvers live.** `resolvePeriod` and `resolveStyle` go in `core/architecture-era/` (a new directory; `resolve-period.ts` and `resolve-style.ts`). They are period-and-style-domain logic spanning project, floor, and room, not room-topology logic. If a later cycle adds more such helpers they join them there. The directory name avoids the single word "era" now that the concept is two axes; it reads as English and carries no milestone code.

---

## File structure

### New files

- `core/registries/periods.ts`: `Period` interface and `builtinPeriods` registry, mirroring `finishes.ts`.
- `core/registries/periods.test.ts`: registry seeding and lookup tests.
- `core/registries/styles.ts`: `Style` interface (with `category` and `hasVernacularVariant`) and `builtinStyles` registry.
- `core/registries/styles.test.ts`: registry seeding, category, and vernacular-variant tests.
- `core/registries/room-purposes.ts`: `RoomPurpose` interface and `builtinRoomPurposes` registry.
- `core/registries/room-purposes.test.ts`: registry seeding and lookup tests.
- `core/architecture-era/resolve-period.ts`: pure `resolvePeriod` hierarchy helper.
- `core/architecture-era/resolve-period.test.ts`: period hierarchy resolution tests.
- `core/architecture-era/resolve-style.ts`: pure `resolveStyle` hierarchy helper.
- `core/architecture-era/resolve-style.test.ts`: style hierarchy resolution tests.
- `core/migrations/schema/add-period-and-style.ts`: schema migration renaming `meta.era` to `meta.period` and accommodating the new style and floor fields.
- `core/migrations/schema/add-period-and-style.test.ts`: migration test.

### Modified files (kept minimal and additive; flagged for merge coordination)

- `core/model/types.ts`: rename `EraId` to `PeriodId`; add `StyleId` and `RoomPurposeId` aliases and the `StyleTag` interface; rename `ProjectMeta.era` to `period` and add `style?: StyleTag`; add `periodOverride?` and `styleOverride?` to `Floor`; add `purpose?`, `subPurpose?`, `periodOverride?`, `styleOverride?` to `RoomOverride`. **Shared file: the assets track may also touch this. Most edits here are additive (new aliases, the `StyleTag` interface, new optional fields). The one non-additive edit is renaming `era` to `period` on `ProjectMeta` and renaming `EraId` to `PeriodId`; both are mechanical renames the orchestrator must apply repo-wide in `core/` and re-run typecheck after each merge. Sequence the merges and re-run typecheck after each.**
- `core/model/factories.ts`: bump `CURRENT_SCHEMA_VERSION`; rename the `era` option/field to `period`; thread the optional `style` default through `createEmptyProject`. The floor factory needs no field changes because the new floor fields are optional and default to absent.
- `core/migrations/schema/index.ts`: append `addPeriodAndStyleMigration` to `SCHEMA_MIGRATIONS`.
- `core/commands/handlers/project-commands.ts`: add `setFloorPeriod` and `setFloorStyle` commands and handlers (floor-level), plus `setProjectPeriod` and `setProjectStyle` if project-level setters are wanted in this slice (see cycle 4 note; project-level setters are included because the project period and style are now first-class tags users will change).
- `core/commands/handlers/project-commands.test.ts`: tests for the new project and floor commands.
- `core/commands/handlers/room-commands.ts`: add `setRoomPurpose`, `setRoomSubPurpose`, `setRoomPeriod`, and `setRoomStyle` commands and handlers.
- `core/commands/handlers/room-commands.test.ts`: tests for the room commands.
- `core/index.ts`: barrel exports for all new types, registries, the resolvers, and the new commands. **Shared file: the assets track may also touch this. The new lines are append-only, but the `EraId` export line is renamed to `PeriodId`; re-run typecheck after each merge.**

---

## Cycle 1: The period registry exists and is seeded with the MVP periods

**Files:**

- Create: `core/registries/periods.ts`
- Test: `core/registries/periods.test.ts`

This is the first, concrete RED behavior the orchestrator dispatches verbatim. It seeds and pins the period registry.

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Create `core/registries/periods.test.ts`.

**Test file:** `core/registries/periods.test.ts`
**Test name (describe + it):** `builtin periods` > `seeds the MVP chronological periods with the registry version`
**Assertion:** the registry's `version` equals `PERIOD_REGISTRY_VERSION`; looking up `'victorian'` returns an entry whose `en-US` display name is `'Victorian'` and whose `approximateRange` is `'c. 1837-1901'`; and the explicit `'unknown'` period is present for houses of uncertain date.

```typescript
import { describe, expect, it } from 'vitest'
import { getEntry } from './registry'
import { PERIOD_REGISTRY_VERSION, builtinPeriods } from './periods'

describe('builtin periods', () => {
  it('seeds the MVP chronological periods with the registry version', () => {
    expect(builtinPeriods.version).toBe(PERIOD_REGISTRY_VERSION)

    const victorian = getEntry(builtinPeriods, 'victorian')
    expect(victorian?.displayName['en-US']).toBe('Victorian')
    expect(victorian?.approximateRange).toBe('c. 1837-1901')
  })

  it('includes the explicit unknown period for houses of uncertain date', () => {
    expect(getEntry(builtinPeriods, 'unknown')?.displayName['en-US']).toBe('Unknown')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/registries/periods.test.ts`
Expected: FAIL, cannot resolve module `./periods` (or `builtinPeriods`/`PERIOD_REGISTRY_VERSION` undefined).

Commit the RED test: `git add core/registries/periods.test.ts && git commit -m "test: seed a period registry with the MVP periods"`

### GREEN

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

Create `core/registries/periods.ts`, mirroring `finishes.ts`. Seed the approved periods.

```typescript
import { createRegistry, type Registry, type RegistryEntry } from './registry'

/**
 * A chronological period a project, floor, or room can be tagged with. The
 * effective period resolves through the hierarchy
 * room.periodOverride ?? floor.periodOverride ?? project.period; see the design
 * specification, section 3.2 (which describes this as the era hierarchy; period
 * and style are the two axes that concept is realized as).
 */
export interface Period extends RegistryEntry {
  /** Locale-aware display names. MVP ships en-US only (design spec 7.2). */
  displayName: Record<string, string>
  /** Human-readable approximate date span, for example "c. 1837-1901". */
  approximateRange: string
}

export const PERIOD_REGISTRY_VERSION = 1

export const builtinPeriods: Registry<Period> = createRegistry(PERIOD_REGISTRY_VERSION, [
  { id: 'colonial', displayName: { 'en-US': 'Colonial' }, approximateRange: 'c. 1600-1780' },
  {
    id: 'early-republic',
    displayName: { 'en-US': 'Early Republic' },
    approximateRange: 'c. 1780-1830',
  },
  { id: 'antebellum', displayName: { 'en-US': 'Antebellum' }, approximateRange: 'c. 1830-1860' },
  { id: 'victorian', displayName: { 'en-US': 'Victorian' }, approximateRange: 'c. 1837-1901' },
  { id: 'edwardian', displayName: { 'en-US': 'Edwardian' }, approximateRange: 'c. 1901-1918' },
  { id: 'interwar', displayName: { 'en-US': 'Interwar' }, approximateRange: 'c. 1918-1945' },
  { id: 'postwar', displayName: { 'en-US': 'Postwar' }, approximateRange: 'c. 1945-1970' },
  {
    id: 'contemporary',
    displayName: { 'en-US': 'Contemporary' },
    approximateRange: 'c. 1970-present',
  },
  { id: 'unknown', displayName: { 'en-US': 'Unknown' }, approximateRange: 'Unknown' },
])
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/registries/periods.test.ts`
Expected: PASS.

Commit the GREEN implementation: `git add core/registries/periods.ts && git commit -m "feat: add the period registry seeded with MVP periods"`

### BLUE

- [ ] **Step 5: Clean-code review then refactor (`/clean-code-review`, `/refactor`)**

Review the registry against `.claude/rules.md`. Expect it to be clean (it is a declarative data table identical in shape to `finishes.ts`, and `no-magic-numbers` is already disabled under `**/registries/**` per ADR-0006; the date ranges are strings, not magic numbers, so no exposure there). Land the BLUE marker commit even if empty: `git commit --allow-empty -m "refactor: tidy the period registry"`.

---

## Cycle 2: The style registry exists, declares academic and vernacular categories, and marks vernacular-variant styles

**Files:**

- Create: `core/registries/styles.ts`
- Test: `core/registries/styles.test.ts`

This cycle pins the chosen vernacular-variant representation (decision 3).

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Create `core/registries/styles.test.ts`.

**Test name:** `builtin styles` > `seeds the MVP styles with their academic or vernacular category`
**Assertion:** the registry version equals `STYLE_REGISTRY_VERSION`; `'queen-anne'` is `category: 'academic'`; `'folk-victorian'` is `category: 'vernacular'`; `'gothic-revival'` is academic and declares `hasVernacularVariant: true` (its vernacular form, Carpenter Gothic, is taggable through the style-tag modifier rather than as its own id); and the national-folk forms (`hall-and-parlor`, `i-house`, `shotgun`, `saltbox`, `gabled-ell`) are all `category: 'vernacular'`.

```typescript
import { describe, expect, it } from 'vitest'
import { getEntry } from './registry'
import { STYLE_REGISTRY_VERSION, builtinStyles } from './styles'

describe('builtin styles', () => {
  it('seeds the MVP styles with their academic or vernacular category', () => {
    expect(builtinStyles.version).toBe(STYLE_REGISTRY_VERSION)
    expect(getEntry(builtinStyles, 'queen-anne')?.category).toBe('academic')
    expect(getEntry(builtinStyles, 'folk-victorian')?.category).toBe('vernacular')
    expect(getEntry(builtinStyles, 'queen-anne')?.displayName['en-US']).toBe('Queen Anne')
  })

  it('marks an academic style that has a recognized vernacular variant', () => {
    const gothicRevival = getEntry(builtinStyles, 'gothic-revival')
    expect(gothicRevival?.category).toBe('academic')
    expect(gothicRevival?.hasVernacularVariant).toBe(true)
  })

  it('seeds the national-folk vernacular forms as first-class vernacular entries', () => {
    for (const id of ['hall-and-parlor', 'i-house', 'gabled-ell', 'shotgun', 'saltbox']) {
      expect(getEntry(builtinStyles, id)?.category).toBe('vernacular')
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/registries/styles.test.ts`
Expected: FAIL, cannot resolve module `./styles`.

Commit: `git add core/registries/styles.test.ts && git commit -m "test: seed a style registry with academic and vernacular categories"`

### GREEN

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

Create `core/registries/styles.ts`. Each entry declares `category`; academic entries with a recognized vernacular form declare `hasVernacularVariant: true`. The seed is the approved style list. Mark `hasVernacularVariant: true` on academic high styles whose vernacular form is a recognized variant rather than its own seeded id (at minimum Gothic Revival, whose vernacular is Carpenter Gothic; Italianate and Second Empire also had widespread vernacular cottage forms, so they carry the flag too). The named vernacular forms (`folk-victorian`, `hall-and-parlor`, `i-house`, `gabled-ell`, `shotgun`, `saltbox`) are seeded directly as `category: 'vernacular'`.

```typescript
import { createRegistry, type Registry, type RegistryEntry } from './registry'

/** Whether a style is an academic (high) style or a vernacular (folk) form. */
export type StyleCategory = 'academic' | 'vernacular'

/**
 * An architectural style a project, floor, or room can be tagged with. The
 * effective style resolves through the hierarchy
 * room.styleOverride ?? floor.styleOverride ?? project.style.
 *
 * Styles divide into academic high styles and vernacular folk forms. Some
 * academic styles have a recognized vernacular variant that is not a distinct
 * named style (Carpenter Gothic is vernacular Gothic Revival); those entries set
 * `hasVernacularVariant: true`, and a StyleTag referencing them may set
 * `vernacular: true` to select that variant. Named vernacular forms (Folk
 * Victorian, I-house, shotgun) are seeded directly with `category: 'vernacular'`.
 */
export interface Style extends RegistryEntry {
  /** Locale-aware display names. MVP ships en-US only (design spec 7.2). */
  displayName: Record<string, string>
  category: StyleCategory
  /**
   * True when this academic style has a recognized vernacular variant selectable
   * through the StyleTag `vernacular` modifier. Meaningful only on academic
   * entries; absent (treated as false) elsewhere.
   */
  hasVernacularVariant?: boolean
}

export const STYLE_REGISTRY_VERSION = 1

const academic = (id: string, name: string, hasVernacularVariant?: boolean): Style => ({
  id,
  displayName: { 'en-US': name },
  category: 'academic',
  ...(hasVernacularVariant === true ? { hasVernacularVariant: true } : {}),
})

const vernacular = (id: string, name: string): Style => ({
  id,
  displayName: { 'en-US': name },
  category: 'vernacular',
})

export const builtinStyles: Registry<Style> = createRegistry(STYLE_REGISTRY_VERSION, [
  academic('georgian', 'Georgian'),
  academic('federal', 'Federal'),
  academic('greek-revival', 'Greek Revival'),
  academic('gothic-revival', 'Gothic Revival', true),
  academic('italianate', 'Italianate', true),
  academic('second-empire', 'Second Empire', true),
  academic('stick', 'Stick'),
  academic('queen-anne', 'Queen Anne'),
  academic('shingle', 'Shingle'),
  academic('romanesque-revival', 'Romanesque Revival'),
  vernacular('folk-victorian', 'Folk Victorian'),
  academic('colonial-revival', 'Colonial Revival'),
  academic('craftsman', 'Craftsman'),
  academic('bungalow', 'Bungalow'),
  academic('prairie', 'Prairie'),
  academic('foursquare', 'Foursquare'),
  academic('tudor-revival', 'Tudor Revival'),
  academic('spanish-colonial-revival', 'Spanish Colonial Revival'),
  academic('cape-cod', 'Cape Cod'),
  academic('art-deco', 'Art Deco'),
  academic('minimal-traditional', 'Minimal Traditional'),
  academic('mid-century-modern', 'Mid-Century Modern'),
  academic('ranch', 'Ranch'),
  academic('split-level', 'Split-Level'),
  academic('neo-eclectic', 'Neo-Eclectic'),
  academic('contemporary-style', 'Contemporary'),
  vernacular('hall-and-parlor', 'Hall and Parlor'),
  vernacular('i-house', 'I-House'),
  vernacular('gabled-ell', 'Gabled Ell'),
  vernacular('shotgun', 'Shotgun'),
  vernacular('saltbox', 'Saltbox'),
  academic('unknown', 'Unknown'),
])
```

(Note: `'unknown'` is seeded as `category: 'academic'` only because it needs a category and is not a folk form; a later cycle may introduce a dedicated `'unclassified'` category if that proves wrong. The test does not pin `'unknown'`'s category, so the implementer is free here. The two helper functions `academic`/`vernacular` keep the table readable; if ESLint's `max-lines` or the no-magic-numbers rule complains, the implementer may inline them, but the helpers are the cleaner shape.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/registries/styles.test.ts`
Expected: PASS.

Commit: `git add core/registries/styles.ts && git commit -m "feat: add the style registry with academic and vernacular categories"`

### BLUE

- [ ] **Step 5: Clean-code review then refactor (`/clean-code-review`, `/refactor`)**

Review against `.claude/rules.md`. Watch `max-lines` (300-line ceiling) on the seed table; if the file approaches it, the refactorer may move the seed array to a sibling data module, but only if ESLint actually flags it. Land the BLUE marker commit even if empty: `git commit --allow-empty -m "refactor: tidy the style registry"`.

---

## Cycle 3: The room-purpose registry exists and is seeded with the MVP purposes

**Files:**

- Create: `core/registries/room-purposes.ts`
- Test: `core/registries/room-purposes.test.ts`

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Create `core/registries/room-purposes.test.ts`.

**Test name:** `builtin room purposes` > `seeds the MVP room purposes with the registry version`
**Assertion:** the registry version equals `ROOM_PURPOSE_REGISTRY_VERSION`; it contains the common modern purposes (`kitchen`, `bedroom`); it contains the historic reception and service purposes (`parlor`, `scullery`, `butlers-pantry`); and the explicit `'other'` catch-all is present.

```typescript
import { describe, expect, it } from 'vitest'
import { getEntry } from './registry'
import { ROOM_PURPOSE_REGISTRY_VERSION, builtinRoomPurposes } from './room-purposes'

describe('builtin room purposes', () => {
  it('seeds the MVP room purposes with the registry version', () => {
    expect(builtinRoomPurposes.version).toBe(ROOM_PURPOSE_REGISTRY_VERSION)
    expect(getEntry(builtinRoomPurposes, 'kitchen')?.displayName['en-US']).toBe('Kitchen')
    expect(getEntry(builtinRoomPurposes, 'bedroom')?.displayName['en-US']).toBe('Bedroom')
  })

  it('includes historic reception and service purposes', () => {
    expect(getEntry(builtinRoomPurposes, 'parlor')?.displayName['en-US']).toBe('Parlor')
    expect(getEntry(builtinRoomPurposes, 'scullery')?.displayName['en-US']).toBe('Scullery')
    expect(getEntry(builtinRoomPurposes, 'butlers-pantry')?.displayName['en-US']).toBe(
      "Butler's Pantry",
    )
  })

  it('includes the explicit other catch-all purpose', () => {
    expect(getEntry(builtinRoomPurposes, 'other')?.displayName['en-US']).toBe('Other')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/registries/room-purposes.test.ts`
Expected: FAIL, cannot resolve module `./room-purposes`.

Commit: `git add core/registries/room-purposes.test.ts && git commit -m "test: seed a room-purpose registry with the MVP purposes"`

### GREEN

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

Create `core/registries/room-purposes.ts`. Seed the approved room-purpose set (design spec section 4.4 names "kitchen, bedroom, dining, parlor, sitting room, etc."; the approved seed widens this to the historic reception, service, and private/transitional rooms an old-house planner needs). Era and style biasing of the library is an assets-track convergence node per ADR-0044, not this data slice; the registry seeds the vocabulary only.

```typescript
import { createRegistry, type Registry, type RegistryEntry } from './registry'

/**
 * A room's primary purpose. Stored on a room as a registry id; the room's
 * optional free-text subPurpose, plus its period and style overrides, live
 * alongside it on the RoomOverride. Period-aware and style-aware library biasing
 * is a later convergence with the assets track and is not modeled here.
 */
export interface RoomPurpose extends RegistryEntry {
  /** Locale-aware display names. MVP ships en-US only (design spec 7.2). */
  displayName: Record<string, string>
}

export const ROOM_PURPOSE_REGISTRY_VERSION = 1

const purpose = (id: string, name: string): RoomPurpose => ({ id, displayName: { 'en-US': name } })

export const builtinRoomPurposes: Registry<RoomPurpose> = createRegistry(
  ROOM_PURPOSE_REGISTRY_VERSION,
  [
    // Common modern
    purpose('living-room', 'Living Room'),
    purpose('kitchen', 'Kitchen'),
    purpose('dining-room', 'Dining Room'),
    purpose('bedroom', 'Bedroom'),
    purpose('primary-bedroom', 'Primary Bedroom'),
    purpose('bathroom', 'Bathroom'),
    purpose('powder-room', 'Powder Room'),
    purpose('family-room', 'Family Room'),
    purpose('office', 'Office'),
    purpose('laundry', 'Laundry'),
    purpose('garage', 'Garage'),
    purpose('basement', 'Basement'),
    purpose('attic', 'Attic'),
    purpose('closet', 'Closet'),
    purpose('pantry', 'Pantry'),
    purpose('mudroom', 'Mudroom'),
    purpose('entry', 'Entry'),
    purpose('hallway', 'Hallway'),
    // Historic reception
    purpose('parlor', 'Parlor'),
    purpose('front-parlor', 'Front Parlor'),
    purpose('back-parlor', 'Back Parlor'),
    purpose('sitting-room', 'Sitting Room'),
    purpose('drawing-room', 'Drawing Room'),
    purpose('morning-room', 'Morning Room'),
    purpose('library', 'Library'),
    purpose('den', 'Den'),
    purpose('music-room', 'Music Room'),
    purpose('conservatory', 'Conservatory'),
    purpose('vestibule', 'Vestibule'),
    purpose('smoking-room', 'Smoking Room'),
    purpose('billiard-room', 'Billiard Room'),
    // Historic service
    purpose('butlers-pantry', "Butler's Pantry"),
    purpose('scullery', 'Scullery'),
    purpose('larder', 'Larder'),
    purpose('summer-kitchen', 'Summer Kitchen'),
    purpose('boot-room', 'Boot Room'),
    purpose('servants-quarters', "Servants' Quarters"),
    purpose('maids-room', "Maid's Room"),
    purpose('root-cellar', 'Root Cellar'),
    purpose('coal-cellar', 'Coal Cellar'),
    purpose('wash-house', 'Wash House'),
    // Private / transitional
    purpose('nursery', 'Nursery'),
    purpose('sewing-room', 'Sewing Room'),
    purpose('dressing-room', 'Dressing Room'),
    purpose('sleeping-porch', 'Sleeping Porch'),
    purpose('porch', 'Porch'),
    purpose('sunroom', 'Sunroom'),
    // Catch-all
    purpose('other', 'Other'),
  ],
)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/registries/room-purposes.test.ts`
Expected: PASS.

Commit: `git add core/registries/room-purposes.ts && git commit -m "feat: add the room-purpose registry seeded with MVP purposes"`

### BLUE

- [ ] **Step 5: Clean-code review then refactor (`/clean-code-review`, `/refactor`)**

Review against `.claude/rules.md`. Watch `max-lines`; the same seed-table-extraction option as cycle 2 applies if ESLint flags it. Land the BLUE marker commit even if empty: `git commit --allow-empty -m "refactor: tidy the room-purpose registry"`.

---

## Cycle 4: A floor and the project carry explicit period and style tags, set through commands

**Files:**

- Modify: `core/model/types.ts` (rename `EraId` to `PeriodId`; add `StyleId`, `StyleTag`; add `periodOverride?` and `styleOverride?` to `Floor`; rename `ProjectMeta.era` to `period` and add `style?`)
- Modify: `core/model/factories.ts` (rename the `era` option to `period`; thread `style?` through)
- Modify: `core/commands/handlers/project-commands.ts`
- Test: `core/commands/handlers/project-commands.test.ts`

This cycle introduces the `PeriodId` rename and the `StyleTag` type alongside the floor and project setters. The test-author may add the renamed fields and the new fields to fixtures as needed for the test to compile; the implementer owns the production types. Follow the existing dispatcher-driven structure in the test file.

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Add to `core/commands/handlers/project-commands.test.ts`. Cover the floor period, the floor style (including the vernacular modifier), and the project-level setters, with undo.

**Test names:**

- `setFloorPeriod` > `tags a floor with a period and clears it on undo`
- `setFloorStyle` > `tags a floor with a style and the vernacular modifier`
- `setProjectPeriod` > `changes the project default period`

**Assertions:** dispatching `setFloorPeriod(floorId, 'edwardian')` sets `floor.periodOverride` to `'edwardian'`; undo restores it to `undefined`; dispatching with `undefined` clears it. Dispatching `setFloorStyle(floorId, { styleId: 'gothic-revival', vernacular: true })` sets `floor.styleOverride` to that tag. Dispatching `setProjectPeriod('interwar')` sets `project.meta.period`; undo restores the prior value.

```typescript
import { setFloorPeriod, setFloorStyle, setProjectPeriod } from './project-commands'
// ...existing imports (CommandRegistry, Dispatcher, registerProjectCommands,
// createEmptyProject, createFloor) are reused.

function projectWithFloor(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = [createFloor('Ground', { id: 'floor-1' })]
  return project
}

function dispatcherFor(project: Project): Dispatcher<Project> {
  const registry = new CommandRegistry<Project>()
  registerProjectCommands(registry)
  return new Dispatcher<Project>(project, registry)
}

describe('setFloorPeriod', () => {
  it('tags a floor with a period', () => {
    const project = projectWithFloor()
    dispatcherFor(project).dispatch(setFloorPeriod('floor-1', 'edwardian'))
    expect(project.floors[0]?.periodOverride).toBe('edwardian')
  })

  it('restores the prior period on undo', () => {
    const project = projectWithFloor()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setFloorPeriod('floor-1', 'edwardian'))
    dispatcher.undo()
    expect(project.floors[0]?.periodOverride).toBeUndefined()
  })
})

describe('setFloorStyle', () => {
  it('tags a floor with a style and the vernacular modifier', () => {
    const project = projectWithFloor()
    dispatcherFor(project).dispatch(
      setFloorStyle('floor-1', { styleId: 'gothic-revival', vernacular: true }),
    )
    expect(project.floors[0]?.styleOverride).toEqual({
      styleId: 'gothic-revival',
      vernacular: true,
    })
  })
})

describe('setProjectPeriod', () => {
  it('changes the project default period and restores it on undo', () => {
    const project = projectWithFloor()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setProjectPeriod('interwar'))
    expect(project.meta.period).toBe('interwar')
    dispatcher.undo()
    expect(project.meta.period).toBe('victorian')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/commands/handlers/project-commands.test.ts`
Expected: FAIL, the new commands are not exported (and the `period` option/field rename does not yet exist).

Commit: `git add core/commands/handlers/project-commands.test.ts core/model/types.ts core/model/factories.ts && git commit -m "test: set floor and project period and style through commands"`

(The test-author may apply the `era` to `period` rename in the fixtures and add the new fields to make the test compile; the implementer formalizes the production types and the migration next. This is acceptable RED-fixture scope per the project's shared-field convention.)

### GREEN

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

First, update `core/model/types.ts`:

```typescript
/** References an entry in the PeriodRegistry. Validated at the registry boundary, not by this alias. */
export type PeriodId = string

/** References an entry in the StyleRegistry. Validated at the registry boundary, not by this alias. */
export type StyleId = string

/**
 * References an entry in the RoomPurposeRegistry. Validated at the registry
 * boundary, not by this alias.
 */
export type RoomPurposeId = string

/**
 * A style tag: a StyleRegistry id, optionally marked as the vernacular variant
 * of an academic style. The `vernacular` modifier is meaningful only when the
 * referenced Style entry declares `hasVernacularVariant`; it is ignored on
 * entries that are themselves vernacular forms.
 */
export interface StyleTag {
  styleId: StyleId
  vernacular?: boolean
}
```

Rename `ProjectMeta.era` to `period` and add the optional project style:

```typescript
export interface ProjectMeta {
  name: string
  units: UnitSystem
  /** The project's default chronological period; floors and rooms can override. */
  period: PeriodId
  /** The project's default architectural style; floors and rooms can override. */
  style?: StyleTag
  schemaVersion: SchemaVersion
  appVersion: string
  registryVersions: Record<string, number>
}
```

Add the optional floor overrides:

```typescript
export interface Floor {
  id: string
  name: string
  elevation: number
  defaultCeilingHeight: number
  /** Explicit period override; absent means inherit the project period. */
  periodOverride?: PeriodId
  /** Explicit style override; absent means inherit the project style. */
  styleOverride?: StyleTag
  walls: Wall[]
  underlays: Underlay[]
  openings: Opening[]
  dimensions: Dimension[]
}
```

Update `core/model/factories.ts`: rename the `era` field on `NewProjectOptions` to `period`, accept an optional `style?: StyleTag`, and write both into `meta`:

```typescript
export interface NewProjectOptions {
  name: string
  units: UnitSystem
  period: PeriodId
  style?: StyleTag
  appVersion: string
}

export function createEmptyProject(options: NewProjectOptions): Project {
  return {
    meta: {
      name: options.name,
      units: options.units,
      period: options.period,
      ...(options.style !== undefined ? { style: options.style } : {}),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      appVersion: options.appVersion,
      registryVersions: {},
    },
    floors: [],
  }
}
```

(The `CURRENT_SCHEMA_VERSION` bump lands in cycle 6 with the migration; if the test in this cycle asserts nothing about the schema version it may stay at its current value until then. Keep the bump in the migration cycle so the version and its migration land together.)

Then add the commands and handlers to `core/commands/handlers/project-commands.ts`, mirroring `setFloorCeilingHeight`. Import `PeriodId` and `StyleTag` from `'../../model/types'`:

```typescript
export const SET_PROJECT_PERIOD = 'project/set-period'
export const SET_PROJECT_STYLE = 'project/set-style'
export const SET_FLOOR_PERIOD = 'project/set-floor-period'
export const SET_FLOOR_STYLE = 'project/set-floor-style'

export interface SetProjectPeriodParams {
  period: PeriodId
}
export function setProjectPeriod(period: PeriodId): Command<SetProjectPeriodParams> {
  return { type: SET_PROJECT_PERIOD, params: { period }, description: 'Set project period' }
}
const setProjectPeriodHandler: CommandHandler<Project, SetProjectPeriodParams> = {
  apply(state, params) {
    state.meta = { ...state.meta, period: params.period }
  },
}

export interface SetProjectStyleParams {
  style: StyleTag | undefined
}
export function setProjectStyle(style: StyleTag | undefined): Command<SetProjectStyleParams> {
  return { type: SET_PROJECT_STYLE, params: { style }, description: 'Set project style' }
}
const setProjectStyleHandler: CommandHandler<Project, SetProjectStyleParams> = {
  apply(state, params) {
    state.meta = { ...state.meta, style: params.style }
  },
}

export interface SetFloorPeriodParams {
  floorId: string
  period: PeriodId | undefined
}
export function setFloorPeriod(
  floorId: string,
  period: PeriodId | undefined,
): Command<SetFloorPeriodParams> {
  return { type: SET_FLOOR_PERIOD, params: { floorId, period }, description: 'Set floor period' }
}
const setFloorPeriodHandler: CommandHandler<Project, SetFloorPeriodParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId ? { ...floor, periodOverride: params.period } : floor,
    )
  },
}

export interface SetFloorStyleParams {
  floorId: string
  style: StyleTag | undefined
}
export function setFloorStyle(
  floorId: string,
  style: StyleTag | undefined,
): Command<SetFloorStyleParams> {
  return { type: SET_FLOOR_STYLE, params: { floorId, style }, description: 'Set floor style' }
}
const setFloorStyleHandler: CommandHandler<Project, SetFloorStyleParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId ? { ...floor, styleOverride: params.style } : floor,
    )
  },
}
```

Register all four in `registerProjectCommands`:

```typescript
    .register(SET_PROJECT_PERIOD, setProjectPeriodHandler)
    .register(SET_PROJECT_STYLE, setProjectStyleHandler)
    .register(SET_FLOOR_PERIOD, setFloorPeriodHandler)
    .register(SET_FLOOR_STYLE, setFloorStyleHandler)
```

Finally, sweep `core/` for any remaining `era` / `EraId` references in non-test source (other migrations' test fixtures, the `createEmptyProject` call sites in existing tests are owned by their own test files and updated by whichever cycle touches them; production source must compile). The `migrateProject` chain and existing migration test fixtures that build a `meta.era` document deliberately keep `era` because they represent legacy on-disk shapes; the new migration in cycle 6 is what reads `era` and writes `period`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/commands/handlers/project-commands.test.ts`
Expected: PASS. Also run `pnpm typecheck` to catch any missed `era` reference in production source.

Commit: `git add core/model/types.ts core/model/factories.ts core/commands/handlers/project-commands.ts && git commit -m "feat: set floor and project period and style through commands"`

### BLUE

- [ ] **Step 5: Clean-code review then refactor (`/clean-code-review`, `/refactor`)**

Review against `.claude/rules.md`. The four handlers each mirror the existing per-field floor and meta handlers; this is coincidental similarity (per-field handlers), not a missing abstraction. Watch `max-lines` on `project-commands.ts` (300-line ceiling); if this cycle pushes it over, the refactorer may split the period/style commands into a sibling module (for example `core/commands/handlers/architecture-tag-commands.ts`), but only if ESLint actually flags it. Land the BLUE marker commit even if empty: `git commit --allow-empty -m "refactor: tidy the floor and project period and style commands"`.

---

## Cycle 5: A room carries purpose, optional sub-purpose, period, and style, set through commands

**Files:**

- Modify: `core/model/types.ts` (extend `RoomOverride`)
- Modify: `core/commands/handlers/room-commands.ts`
- Test: `core/commands/handlers/room-commands.test.ts`

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Add to `core/commands/handlers/room-commands.test.ts`, reusing its existing `newProject` and `dispatcherFor` helpers and `TARGET_KEY` / `SIBLING_KEY` constants. Cover all four commands and their undo, mirroring the existing `setRoomName` tests. The sub-purpose test must demonstrate that sub-purpose is OPTIONAL: a room can carry a purpose with no sub-purpose, and a sub-purpose can be set and cleared independently.

**Test names:**

- `setRoomPurpose` > `tags a room with a purpose while preserving an existing name`
- `setRoomSubPurpose` > `records an optional free-text sub-purpose and clears it on undo`
- `setRoomPeriod` > `overrides a room period and restores the prior value on undo`
- `setRoomStyle` > `tags a room with a style and the vernacular modifier`

**Assertions:** each command writes its field into `roomOverrides[TARGET_KEY]`; setting purpose preserves an existing `name` on the same entry; a purpose can be set with no sub-purpose (the `subPurpose` field stays absent); setting and undoing a sub-purpose leaves the purpose intact; undo restores the prior value (including back to an absent override map).

```typescript
import { setRoomPeriod, setRoomPurpose, setRoomStyle, setRoomSubPurpose } from './room-commands'

describe('setRoomPurpose', () => {
  it('tags a room with a purpose while preserving an existing name and leaving sub-purpose absent', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setRoomName(TARGET_KEY, 'Kitchen'))

    dispatcher.dispatch(setRoomPurpose(TARGET_KEY, 'kitchen'))

    expect(project.roomOverrides?.[TARGET_KEY]?.name).toBe('Kitchen')
    expect(project.roomOverrides?.[TARGET_KEY]?.purpose).toBe('kitchen')
    expect(project.roomOverrides?.[TARGET_KEY]?.subPurpose).toBeUndefined()
  })

  it('restores absent overrides on undo when none existed before', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setRoomPurpose(TARGET_KEY, 'kitchen'))

    dispatcher.undo()

    expect(project.roomOverrides).toBeUndefined()
  })
})

describe('setRoomSubPurpose', () => {
  it('records an optional free-text sub-purpose and clears it on undo', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setRoomPurpose(TARGET_KEY, 'butlers-pantry'))

    dispatcher.dispatch(setRoomSubPurpose(TARGET_KEY, 'Silver Pantry'))
    expect(project.roomOverrides?.[TARGET_KEY]?.subPurpose).toBe('Silver Pantry')

    dispatcher.undo()
    expect(project.roomOverrides?.[TARGET_KEY]?.subPurpose).toBeUndefined()
    expect(project.roomOverrides?.[TARGET_KEY]?.purpose).toBe('butlers-pantry')
  })
})

describe('setRoomPeriod', () => {
  it('overrides a room period and restores the prior value on undo', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setRoomPeriod(TARGET_KEY, 'edwardian'))
    expect(project.roomOverrides?.[TARGET_KEY]?.periodOverride).toBe('edwardian')

    dispatcher.undo()

    expect(project.roomOverrides).toBeUndefined()
  })
})

describe('setRoomStyle', () => {
  it('tags a room with a style and the vernacular modifier', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(setRoomStyle(TARGET_KEY, { styleId: 'italianate', vernacular: true }))

    expect(project.roomOverrides?.[TARGET_KEY]?.styleOverride).toEqual({
      styleId: 'italianate',
      vernacular: true,
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/commands/handlers/room-commands.test.ts`
Expected: FAIL, the new commands are not exported.

Commit: `git add core/commands/handlers/room-commands.test.ts core/model/types.ts && git commit -m "test: tag a room with purpose, sub-purpose, period, and style"`

### GREEN

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

Extend `RoomOverride` in `core/model/types.ts` (replace the doc comment that said these fields "arrive additively" with one describing the now-present fields):

```typescript
export interface RoomOverride {
  /** User-entered display name for the room; absent means geometry only (no name). */
  name?: string
  /** Replacement boundary for cases where wall topology cannot infer a room. */
  customPolygon?: Point[]
  /** Primary room purpose, a RoomPurposeRegistry id. Absent means untagged. */
  purpose?: RoomPurposeId
  /** Optional finer-grained free-text purpose label (for example "Silver Pantry"). Never required. */
  subPurpose?: string
  /** Explicit period override; absent means inherit the floor or project period. */
  periodOverride?: PeriodId
  /** Explicit style override; absent means inherit the floor or project style. */
  styleOverride?: StyleTag
}
```

(`PeriodId`, `StyleTag`, and `RoomPurposeId` are all defined in `types.ts` already after cycle 4, so no import is needed.)

Add four commands and handlers to `core/commands/handlers/room-commands.ts`, each reusing the existing `mergeRoomOverride` helper exactly as `setRoomName` does. Import `PeriodId`, `RoomPurposeId`, and `StyleTag`:

```typescript
import type {
  PeriodId,
  Point,
  Project,
  RoomOverride,
  RoomPurposeId,
  StyleTag,
} from '../../model/types'

export const SET_ROOM_PURPOSE = 'room/set-purpose'
export const SET_ROOM_SUB_PURPOSE = 'room/set-sub-purpose'
export const SET_ROOM_PERIOD = 'room/set-period'
export const SET_ROOM_STYLE = 'room/set-style'

export interface SetRoomPurposeParams {
  roomKey: string
  purpose: RoomPurposeId | undefined
}
export function setRoomPurpose(
  roomKey: string,
  purpose: RoomPurposeId | undefined,
): Command<SetRoomPurposeParams> {
  return { type: SET_ROOM_PURPOSE, params: { roomKey, purpose }, description: 'Set room purpose' }
}
const setRoomPurposeHandler: CommandHandler<Project, SetRoomPurposeParams> = {
  apply(state, params) {
    mergeRoomOverride(state, params.roomKey, { purpose: params.purpose })
  },
}

export interface SetRoomSubPurposeParams {
  roomKey: string
  subPurpose: string | undefined
}
export function setRoomSubPurpose(
  roomKey: string,
  subPurpose: string | undefined,
): Command<SetRoomSubPurposeParams> {
  return {
    type: SET_ROOM_SUB_PURPOSE,
    params: { roomKey, subPurpose },
    description: 'Set room sub-purpose',
  }
}
const setRoomSubPurposeHandler: CommandHandler<Project, SetRoomSubPurposeParams> = {
  apply(state, params) {
    mergeRoomOverride(state, params.roomKey, { subPurpose: params.subPurpose })
  },
}

export interface SetRoomPeriodParams {
  roomKey: string
  period: PeriodId | undefined
}
export function setRoomPeriod(
  roomKey: string,
  period: PeriodId | undefined,
): Command<SetRoomPeriodParams> {
  return { type: SET_ROOM_PERIOD, params: { roomKey, period }, description: 'Set room period' }
}
const setRoomPeriodHandler: CommandHandler<Project, SetRoomPeriodParams> = {
  apply(state, params) {
    mergeRoomOverride(state, params.roomKey, { periodOverride: params.period })
  },
}

export interface SetRoomStyleParams {
  roomKey: string
  style: StyleTag | undefined
}
export function setRoomStyle(
  roomKey: string,
  style: StyleTag | undefined,
): Command<SetRoomStyleParams> {
  return { type: SET_ROOM_STYLE, params: { roomKey, style }, description: 'Set room style' }
}
const setRoomStyleHandler: CommandHandler<Project, SetRoomStyleParams> = {
  apply(state, params) {
    mergeRoomOverride(state, params.roomKey, { styleOverride: params.style })
  },
}
```

Register all four in `registerRoomCommands`:

```typescript
    .register(SET_ROOM_PURPOSE, setRoomPurposeHandler)
    .register(SET_ROOM_SUB_PURPOSE, setRoomSubPurposeHandler)
    .register(SET_ROOM_PERIOD, setRoomPeriodHandler)
    .register(SET_ROOM_STYLE, setRoomStyleHandler)
```

Note: `mergeRoomOverride`'s patch type is `Partial<RoomOverride>`, so the new fields are accepted without changing the helper. Writing `undefined` through the patch sets the field to `undefined` on the merged entry, which is the intended clear-on-undef behavior.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/commands/handlers/room-commands.test.ts`
Expected: PASS.

Commit: `git add core/model/types.ts core/commands/handlers/room-commands.ts && git commit -m "feat: tag a room with purpose, sub-purpose, period, and style"`

### BLUE

- [ ] **Step 5: Clean-code review then refactor (`/clean-code-review`, `/refactor`)**

Review against `.claude/rules.md`. The four handlers each delegate to `mergeRoomOverride` with a single-field patch, matching the existing pattern; this is the right level of abstraction. Watch `max-lines` on `room-commands.ts` (300-line ceiling, see the ESLint gotchas memo); this cycle adds four command/handler pairs, so the file is the most likely in this slice to exceed the ceiling. If ESLint flags it, the refactorer splits the room-metadata commands into a sibling module (for example `core/commands/handlers/room-vocabulary-commands.ts`) and re-exports through the barrel. Land the BLUE marker commit even if empty: `git commit --allow-empty -m "refactor: tidy the room vocabulary commands"`.

---

## Cycle 6: Effective period and style resolve through the project, floor, and room hierarchy

**Files:**

- Create: `core/architecture-era/resolve-period.ts`
- Create: `core/architecture-era/resolve-style.ts`
- Test: `core/architecture-era/resolve-period.test.ts`
- Test: `core/architecture-era/resolve-style.test.ts`

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Create both resolver tests. Each mirrors the documented precedence `room ?? floor ?? project`.

**Test name (period):** `resolvePeriod` > `resolves room over floor over project`
**Assertion:** with `project.meta.period = 'victorian'`, a floor `periodOverride = 'edwardian'`, and a room override `periodOverride = 'interwar'`, `resolvePeriod(project, floorId, roomKey)` returns `'interwar'`; removing the room override returns `'edwardian'`; removing the floor override returns `'victorian'`; an unknown floor falls through to the project period.

**Test name (style):** `resolveStyle` > `resolves room over floor over project and may return undefined`
**Assertion:** with `project.meta.style` absent, `resolveStyle(project, floorId)` returns `undefined`; with a floor `styleOverride = { styleId: 'queen-anne' }`, it returns that tag; a room `styleOverride = { styleId: 'gothic-revival', vernacular: true }` wins over the floor.

```typescript
// core/architecture-era/resolve-period.test.ts
import { describe, expect, it } from 'vitest'
import { resolvePeriod } from './resolve-period'
import { createEmptyProject, createFloor } from '../model/factories'
import type { Project } from '../model/types'

const ROOM_KEY = 'wall-a-wall-b'

function project(): Project {
  const base = createEmptyProject({
    name: 'House',
    units: 'imperial',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  base.floors = [createFloor('Ground', { id: 'floor-1' })]
  return base
}

describe('resolvePeriod', () => {
  it('falls back to the project period when nothing is overridden', () => {
    expect(resolvePeriod(project(), 'floor-1')).toBe('victorian')
  })

  it('prefers a floor override over the project period', () => {
    const subject = project()
    subject.floors[0]!.periodOverride = 'edwardian'
    expect(resolvePeriod(subject, 'floor-1')).toBe('edwardian')
  })

  it('prefers a room override over the floor and project period', () => {
    const subject = project()
    subject.floors[0]!.periodOverride = 'edwardian'
    subject.roomOverrides = { [ROOM_KEY]: { periodOverride: 'interwar' } }
    expect(resolvePeriod(subject, 'floor-1', ROOM_KEY)).toBe('interwar')
  })

  it('falls back to the project period for an unknown floor', () => {
    expect(resolvePeriod(project(), 'no-such-floor')).toBe('victorian')
  })
})
```

```typescript
// core/architecture-era/resolve-style.test.ts
import { describe, expect, it } from 'vitest'
import { resolveStyle } from './resolve-style'
import { createEmptyProject, createFloor } from '../model/factories'
import type { Project } from '../model/types'

const ROOM_KEY = 'wall-a-wall-b'

function project(): Project {
  const base = createEmptyProject({
    name: 'House',
    units: 'imperial',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  base.floors = [createFloor('Ground', { id: 'floor-1' })]
  return base
}

describe('resolveStyle', () => {
  it('returns undefined when no level carries a style', () => {
    expect(resolveStyle(project(), 'floor-1')).toBeUndefined()
  })

  it('prefers a floor style over the absent project style', () => {
    const subject = project()
    subject.floors[0]!.styleOverride = { styleId: 'queen-anne' }
    expect(resolveStyle(subject, 'floor-1')).toEqual({ styleId: 'queen-anne' })
  })

  it('prefers a room style over the floor style', () => {
    const subject = project()
    subject.floors[0]!.styleOverride = { styleId: 'queen-anne' }
    subject.roomOverrides = {
      [ROOM_KEY]: { styleOverride: { styleId: 'gothic-revival', vernacular: true } },
    }
    expect(resolveStyle(subject, 'floor-1', ROOM_KEY)).toEqual({
      styleId: 'gothic-revival',
      vernacular: true,
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/architecture-era`
Expected: FAIL, cannot resolve the resolver modules.

Commit: `git add core/architecture-era/resolve-period.test.ts core/architecture-era/resolve-style.test.ts && git commit -m "test: resolve effective period and style through the override hierarchy"`

### GREEN

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

Create both resolvers. Implement exactly the documented precedence; do not store the result.

```typescript
// core/architecture-era/resolve-period.ts
import type { PeriodId, Project } from '../model/types'

/**
 * The effective period of a floor or room:
 * room.periodOverride ?? floor.periodOverride ?? project.period. The effective
 * period is never stored; it is computed from the explicit value at each level.
 * An unknown floor or room key falls through to the next available level.
 */
export function resolvePeriod(project: Project, floorId: string, roomKey?: string): PeriodId {
  const roomPeriod =
    roomKey === undefined ? undefined : project.roomOverrides?.[roomKey]?.periodOverride
  const floorPeriod = project.floors.find((floor) => floor.id === floorId)?.periodOverride
  return roomPeriod ?? floorPeriod ?? project.meta.period
}
```

```typescript
// core/architecture-era/resolve-style.ts
import type { Project, StyleTag } from '../model/types'

/**
 * The effective style tag of a floor or room:
 * room.styleOverride ?? floor.styleOverride ?? project.style. Returns undefined
 * when no level carries a style (style, unlike period, has no required default).
 */
export function resolveStyle(
  project: Project,
  floorId: string,
  roomKey?: string,
): StyleTag | undefined {
  const roomStyle =
    roomKey === undefined ? undefined : project.roomOverrides?.[roomKey]?.styleOverride
  const floorStyle = project.floors.find((floor) => floor.id === floorId)?.styleOverride
  return roomStyle ?? floorStyle ?? project.meta.style
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/architecture-era`
Expected: PASS.

Commit: `git add core/architecture-era/resolve-period.ts core/architecture-era/resolve-style.ts && git commit -m "feat: resolve effective period and style through the override hierarchy"`

### BLUE

- [ ] **Step 5: Clean-code review then refactor (`/clean-code-review`, `/refactor`)**

Review against `.claude/rules.md`. Each function is a short expression with three parameters (the ceiling, with `roomKey` optional). The two resolvers share a `room ?? floor ?? project` shape; this is coincidental structural similarity over different field names and return types, not a missing abstraction to collapse. Land the BLUE marker commit even if empty: `git commit --allow-empty -m "refactor: tidy the period and style resolvers"`.

---

## Cycle 7: A saved project renames era to period and round-trips the new fields through a schema migration

**Files:**

- Modify: `core/model/factories.ts` (bump `CURRENT_SCHEMA_VERSION`)
- Create: `core/migrations/schema/add-period-and-style.ts`
- Modify: `core/migrations/schema/index.ts`
- Test: `core/migrations/schema/add-period-and-style.test.ts`

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Create `core/migrations/schema/add-period-and-style.test.ts`, mirroring `add-floor-dimensions.test.ts`. The migration renames the legacy `meta.era` key to `meta.period` and is otherwise structural for the new optional fields. Read `add-floor-dimensions.test.ts` for the exact `from`/`migrate` assertion style before writing.

**Test name:** `add-period-and-style schema migration` > `renames meta.era to meta.period and leaves the new fields absent`
**Assertion:** given a document at `addPeriodAndStyleMigration.from` whose `meta.era` is `'victorian'`, after `migrate` the result has `meta.period === 'victorian'` and no `meta.era` key; floors without `periodOverride` or `styleOverride` pass through unchanged; the migration does not invent a `meta.style`; and the migration does not itself bump `meta.schemaVersion`.

```typescript
import { describe, expect, it } from 'vitest'
import type { ProjectShape } from '../../index'
import { addPeriodAndStyleMigration } from './add-period-and-style'

function legacyDocument(): ProjectShape {
  return {
    meta: {
      name: 'P',
      units: 'imperial',
      era: 'victorian',
      schemaVersion: addPeriodAndStyleMigration.from,
      appVersion: '0.1.0',
      registryVersions: {},
    },
    floors: [{ id: 'f1', name: 'Ground', walls: [], openings: [], underlays: [], dimensions: [] }],
  } as unknown as ProjectShape
}

describe('add-period-and-style schema migration', () => {
  it('starts its forward step from the prior current schema version', () => {
    expect(addPeriodAndStyleMigration.from).toBeGreaterThan(0)
  })

  it('renames meta.era to meta.period', () => {
    const migrated = addPeriodAndStyleMigration.migrate(legacyDocument()) as {
      meta: Record<string, unknown>
    }
    expect(migrated.meta.period).toBe('victorian')
    expect('era' in migrated.meta).toBe(false)
  })

  it('does not invent a project style', () => {
    const migrated = addPeriodAndStyleMigration.migrate(legacyDocument()) as {
      meta: Record<string, unknown>
    }
    expect('style' in migrated.meta).toBe(false)
  })

  it('leaves floors without period or style overrides untouched', () => {
    const migrated = addPeriodAndStyleMigration.migrate(legacyDocument())
    expect(migrated.floors).toEqual(legacyDocument().floors)
  })

  it('does not set meta.schemaVersion inside the migration step itself', () => {
    const stepped = addPeriodAndStyleMigration.migrate(legacyDocument()) as {
      meta: { schemaVersion: number }
    }
    expect(stepped.meta.schemaVersion).toBe(addPeriodAndStyleMigration.from)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/migrations/schema/add-period-and-style.test.ts`
Expected: FAIL, cannot resolve module `./add-period-and-style`.

Commit: `git add core/migrations/schema/add-period-and-style.test.ts && git commit -m "test: migrate a project from era to period and style"`

### GREEN

- [ ] **Step 3: Write the minimal implementation (implementer, `/implement`)**

The current `CURRENT_SCHEMA_VERSION` is 4 (see the comment in `factories.ts`). Bump it to 5 and extend the version-history comment:

```typescript
// v2 introduces the optional top-level `roomOverrides` map; v3 adds the
// per-floor `openings` array; v4 adds the per-floor `dimensions` array; v5
// renames the project `era` field to `period`, adds the optional project
// `style`, and adds the optional per-floor `periodOverride` and `styleOverride`
// (the per-room period, style, purpose, and sub-purpose ride inside the optional
// roomOverrides map and need no migration).
export const CURRENT_SCHEMA_VERSION = 5
```

Create `core/migrations/schema/add-period-and-style.ts`. The migration renames `meta.era` to `meta.period` when the legacy key is present; the new optional fields need no defaulting (absent is treated identically to present-but-undefined). Its `from` is 4 (the prior current version):

```typescript
import type { ProjectShape, SchemaMigration } from '../types'

/**
 * Migrates a version-4 document forward to version 5. Version 5 renames the
 * project `meta.era` field to `meta.period`, adds the optional project
 * `meta.style`, and adds the optional per-floor `periodOverride` and
 * `styleOverride`.
 *
 * Only the rename needs data work: the migration moves `meta.era` to
 * `meta.period` when the legacy key is present and removes the old key. The new
 * style and floor fields are optional and an absent value is treated identically
 * to an unset one, so they need no defaulting here. The orchestrator advances
 * `meta.schemaVersion`, so the migration must not.
 */
export const addPeriodAndStyleMigration: SchemaMigration = {
  from: 4,
  migrate(project) {
    const meta = project.meta as Record<string, unknown>
    if (!('era' in meta)) {
      return project
    }
    const { era, ...rest } = meta
    return { ...project, meta: { ...rest, period: era } } satisfies ProjectShape
  },
}
```

(If ESLint flags the unused `era`-rename destructuring or `no-unused-vars`, the implementer reads `meta.era` into a local and deletes the key explicitly instead; the behavior is what the test pins.)

Append it to the chain in `core/migrations/schema/index.ts`:

```typescript
import { addPeriodAndStyleMigration } from './add-period-and-style'

export const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = [
  addRoomOverridesMigration,
  addFloorOpeningsMigration,
  addFloorDimensionsMigration,
  addPeriodAndStyleMigration,
]
```

- [ ] **Step 4: Run the test plus the existing migration and factory suites to verify they pass**

Run: `pnpm exec vitest run core/migrations core/model/factories.test.ts`
Expected: PASS. The `createEmptyProject` test asserts `schemaVersion === CURRENT_SCHEMA_VERSION`, so it tracks the bump automatically. Confirm no existing migration test hardcoded the old target version, and that the legacy migration-test fixtures (which build a `meta.era` document to represent an on-disk version-3 or earlier shape) still pass through the earlier migrations unchanged. The new migration is the only step that reads `meta.era`; verify the full `migrateProject` chain promotes an old `era` document all the way to a `period` document.

Commit: `git add core/model/factories.ts core/migrations/schema/add-period-and-style.ts core/migrations/schema/index.ts && git commit -m "feat: migrate a project from era to period and style"`

### BLUE

- [ ] **Step 5: Clean-code review then refactor (`/clean-code-review`, `/refactor`)**

Review against `.claude/rules.md`. The migration is a small structural-plus-rename step. Land the BLUE marker commit even if empty: `git commit --allow-empty -m "refactor: tidy the period and style migration"`.

---

## Cycle 8: The public core API surface exports the new registries, types, resolvers, and commands

**Files:**

- Modify: `core/index.ts`
- Test: `core/index.test.ts` (new)

This cycle has no new domain behavior; it pins the public surface so downstream tracks import from `core/` rather than reaching into module paths. Keep the edits append-only except for the one `EraId` to `PeriodId` rename on the existing model-types export.

### RED

- [ ] **Step 1: Write the failing test (test-author, `/test-first`)**

Add a focused barrel test. `core/index.test.ts` does not exist today and no current core test imports from the barrel; create it and import from `'./index'`.

**Test name:** `core barrel` > `re-exports the period, style, and room-purpose vocabulary`
**Assertion:** importing from the core barrel yields `builtinPeriods`, `builtinStyles`, `builtinRoomPurposes`, `resolvePeriod`, `resolveStyle`, and the new commands (`setProjectPeriod`, `setProjectStyle`, `setFloorPeriod`, `setFloorStyle`, `setRoomPurpose`, `setRoomSubPurpose`, `setRoomPeriod`, `setRoomStyle`) as defined values.

```typescript
import { describe, expect, it } from 'vitest'
import {
  builtinPeriods,
  builtinRoomPurposes,
  builtinStyles,
  resolvePeriod,
  resolveStyle,
  setFloorPeriod,
  setFloorStyle,
  setProjectPeriod,
  setProjectStyle,
  setRoomPeriod,
  setRoomPurpose,
  setRoomStyle,
  setRoomSubPurpose,
} from './index'

describe('core barrel', () => {
  it('re-exports the period, style, and room-purpose vocabulary', () => {
    expect(builtinPeriods.version).toBeGreaterThan(0)
    expect(builtinStyles.version).toBeGreaterThan(0)
    expect(builtinRoomPurposes.version).toBeGreaterThan(0)
    for (const fn of [
      resolvePeriod,
      resolveStyle,
      setProjectPeriod,
      setProjectStyle,
      setFloorPeriod,
      setFloorStyle,
      setRoomPurpose,
      setRoomSubPurpose,
      setRoomPeriod,
      setRoomStyle,
    ]) {
      expect(typeof fn).toBe('function')
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/index.test.ts`
Expected: FAIL, the named exports are not found on the barrel.

Commit: `git add core/index.test.ts && git commit -m "test: pin the period, style, and room-purpose public API surface"`

### GREEN

- [ ] **Step 3: Add the exports (implementer, `/implement`)**

In `core/index.ts`, rename the existing `EraId` re-export to `PeriodId`, then append the new lines (grouped with the existing registry and command exports; append-only otherwise):

```typescript
export type { Period } from './registries/periods'
export { PERIOD_REGISTRY_VERSION, builtinPeriods } from './registries/periods'
export type { Style, StyleCategory } from './registries/styles'
export { STYLE_REGISTRY_VERSION, builtinStyles } from './registries/styles'
export type { RoomPurpose } from './registries/room-purposes'
export { ROOM_PURPOSE_REGISTRY_VERSION, builtinRoomPurposes } from './registries/room-purposes'
export type { PeriodId, RoomPurposeId, StyleId, StyleTag } from './model/types'
export { resolvePeriod } from './architecture-era/resolve-period'
export { resolveStyle } from './architecture-era/resolve-style'
export type {
  SetFloorPeriodParams,
  SetFloorStyleParams,
  SetProjectPeriodParams,
  SetProjectStyleParams,
} from './commands/handlers/project-commands'
export {
  SET_FLOOR_PERIOD,
  SET_FLOOR_STYLE,
  SET_PROJECT_PERIOD,
  SET_PROJECT_STYLE,
  setFloorPeriod,
  setFloorStyle,
  setProjectPeriod,
  setProjectStyle,
} from './commands/handlers/project-commands'
export type {
  SetRoomPeriodParams,
  SetRoomPurposeParams,
  SetRoomStyleParams,
  SetRoomSubPurposeParams,
} from './commands/handlers/room-commands'
export {
  SET_ROOM_PERIOD,
  SET_ROOM_PURPOSE,
  SET_ROOM_STYLE,
  SET_ROOM_SUB_PURPOSE,
  setRoomPeriod,
  setRoomPurpose,
  setRoomStyle,
  setRoomSubPurpose,
} from './commands/handlers/room-commands'
```

Remove `EraId` from the existing `export type { ... } from './model/types'` block and add `PeriodId` (and the other new model-type aliases) so each is exported exactly once. If the refactorer split the room-vocabulary commands into a sibling module in cycle 5, point the room-command re-exports at that module instead.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/index.test.ts`
Expected: PASS.

Commit: `git add core/index.ts && git commit -m "feat: export the period, style, and room-purpose public API surface"`

### BLUE

- [ ] **Step 5: Clean-code review then refactor (`/clean-code-review`, `/refactor`)**

Review against `.claude/rules.md`. Land the BLUE marker commit even if empty: `git commit --allow-empty -m "refactor: tidy the core barrel exports"`.

---

## Final verification (before opening the PR)

- [ ] **Run the full check chain.**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all green. The lint step is the strict gate (warnings count; watch `max-lines` on `styles.ts`, `room-purposes.ts`, `project-commands.ts`, and `room-commands.ts`, plus `max-lines-per-function` and `no-magic-numbers`, per the ESLint gotchas memo). Confirm the `era` to `period` / `EraId` to `PeriodId` rename leaves no dangling reference anywhere in `core/` production source (typecheck catches this).

- [ ] **Confirm the commit sequence per cycle is test then feat then refactor** (the rgb:audit rule). Each of the eight cycles must show that triple, with the refactor commit possibly empty.

- [ ] **PR-level review.** Run `/review` (the pr-reviewer) before merge. Use `origin/main..HEAD` as the audit range (the merging-parallel-worktree-slices memo: the default range can use a stale local main).

- [ ] **Knowledge curation.** This slice establishes three new registries (period, style, room purpose), the academic-and-vernacular style model, and the period/style/purpose tagging-and-resolution data model. That is an architectural unit worth one ADR. After the work lands, write an ADR under `docs/knowledge/decisions/` recording: the decision to split the spec's single `EraRegistry` into a Period registry and a Style registry (extending ADR-0006's registry plan); the vernacular-variant representation (`category` on the entry plus the optional `vernacular` modifier on `StyleTag`); the period/style resolution hierarchies realized in data; the rename of `meta.era` to `meta.period` and its migration; and the decision to store room purpose, sub-purpose, period, and style on `RoomOverride`. Because this diverges from the design specification's single-`EraRegistry` wording (sections 3.2 and 4.4), the ADR is the required record of that spec change per the project rules; the spec text itself is updated only with that ADR in hand, as a follow-on, not inside this data slice.

---

## Merge-coordination summary for the orchestrator

Two files in this slice are shared with the parallel assets track and must be sequenced at merge time:

1. **`core/model/types.ts`**: this slice adds the `StyleId`, `RoomPurposeId` aliases and the `StyleTag` interface, the optional `periodOverride?` / `styleOverride?` fields on `Floor`, the optional `style?` field on `ProjectMeta`, and the optional `purpose?` / `subPurpose?` / `periodOverride?` / `styleOverride?` fields on `RoomOverride`. Those are all additive and merge cleanly. The two non-additive edits are mechanical renames: `EraId` to `PeriodId`, and `ProjectMeta.era` to `period`. If the assets track also reads `era` / `EraId`, the orchestrator must apply the same rename in those edits before merging and re-run typecheck after each merge. No shared field becomes required (per the required-shared-field memo, the breakage risk is only when a shared member becomes required, which this slice avoids), but the rename is a real coordination point.

2. **`core/index.ts`**: this slice appends new export lines and renames the single `EraId` re-export to `PeriodId`. Append-only barrel edits merge cleanly; the one rename must be reconciled if the assets track also re-exports `EraId`. Re-run typecheck after each merge.

All other modified files (`factories.ts`, `migrations/schema/index.ts`, the two command-handler files and their tests) are owned by this track and are unlikely to collide with the assets track.

**The `era` to `period` rename has a wide test-file blast radius the orchestrator must account for.** `factories.ts` carries the rename on `NewProjectOptions`, and a verified grep shows `createEmptyProject(` is called with an `era:` argument in roughly a dozen `core/` test files: `model/factories.test.ts`, `migrations/migrate.test.ts`, every file under `commands/handlers/*.test.ts` (dimension, room, wall, project, opening, transform, underlay), and every file under `scene/*.test.ts` (scene-graph and its dimension/opening variants). All of these must change `era:` to `period:` or production typecheck fails the moment `NewProjectOptions.era` is renamed in cycle 4. Two ways to handle it, both acceptable:

- Preferred: have the cycle-4 implementer step include a focused mechanical sweep of all `createEmptyProject(... era: ...)` call sites in `core/` (production source compiles, so the test files must follow in the same commit). Enumerate them first with `grep -rl "createEmptyProject" core/`.
- Alternatively, the test-author for whichever cycle next touches each test file renames that file's call sites as RED-fixture maintenance.

**One file must keep `era`:** `core/migrations/migrate.test.ts` builds `meta.era` documents that represent legacy on-disk shapes flowing through the migration chain. Those fixtures are the input the new `addPeriodAndStyleMigration` reads; they must stay `era` (the migration is what turns them into `period`). Do not rename the legacy-document fixtures there; only rename any post-migration assertion that expects the migrated output to carry `period`.

`EraId` appears in three production files (`model/types.ts`, `model/factories.ts`, `index.ts`); all three are renamed to `PeriodId` in this slice (cycles 4 and 8). The orchestrator should grep `EraId` and `\bera:` across `core/` before cycle 4 to enumerate the full set.
