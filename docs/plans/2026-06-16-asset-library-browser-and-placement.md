# Asset Library Browser, Custom Import, and 2D Placement Implementation Plan

> **For agentic workers:** This plan is executed with role-separated red-green-blue TDD. Each cycle is `test:` (test-author) then `feat:` (implementer) then `refactor:` (refactorer, possibly an empty marker), dispatched from the main thread. Steps use checkbox (`- [ ]`) syntax for tracking. Run the gate (`pnpm typecheck && pnpm lint && pnpm test`) and `pnpm rgb:audit origin/main..HEAD` after each cycle; run `format:check`, `build`, and the relevant e2e before declaring done.

**Goal:** Let a person browse an asset library, import their own GLB models, and place furniture on the 2D plan, on a furniture-aware document model and a content-addressed asset registry.

**Architecture:** The pack manifest schema graduates from `scripts/pack/` ESM to `core/` TypeScript so the in-app loader and the CLI share one definition (ADR-0024). A `FurnitureInstance` joins each floor (schema `v9 -> v10`). The existing `storage/assets/` `AssetSource` and `AssetRegistry` widen to list and resolve library items across a `PackSource` (a bundled starter pack) and a `UserSource` (imports). A left-docked library panel and a `place-furniture` tool put pieces on the plan through `dispatch`.

**Tech Stack:** TypeScript (`core/`, `storage/`, `bridge/`, `editor/`), React, Vitest, Playwright + axe-core e2e. Node bumps to 22 LTS so the plain-`node` pack CLI can import the graduated `core/` TypeScript via native type stripping. Grounded in `docs/specs/2026-06-16-asset-library-browser-and-placement.md`, ADR-0007 (content addressing), ADR-0024 (schema graduation), ADR-0042 (project-embedded assets), ADR-0006 (registry pattern).

---

## Execution conventions

- **Worktree:** `~/workspace/vernacular.wt/asset-library-browser`, branch `feat/asset-library-browser-and-placement`, stacked on `feat/asset-pack-format-cli` (`b0e4f0a2`, the #173 branch). All work is local; do not push, open PRs, or touch GitHub until the owner lifts the hold. `pnpm install --frozen-lockfile` in this worktree before the first cycle.
- **rgb:audit base:** this branch is stacked on #173, so run `pnpm rgb:audit origin/main..HEAD` (the default range) which covers both #173 and this work; the #173 commits already pass. Each new GREEN is closed by a BLUE marker before the next RED.
- **Role separation:** the `test-author` writes the failing test and may not read implementation source; the `implementer` writes minimal passing code and may not read tests; the `refactorer` cleans implementation while tests stay green. Tell each subagent the exact allowed files for its cycle and to STOP rather than edit shared config (see per-task "Allowed files").
- **Commit discipline:** Conventional Commits, no milestone tags, no `Co-Authored-By`, no em-dashes. `build:`, `docs:`, and pure relocation `refactor:` commits are exempt from the test->feat->refactor sequence (see `rgb:audit` rules).
- **Lint traps** (`.claude/rules.md`, and these are `.ts/.tsx` so all apply): functions <= 40 lines, files <= 300 lines, <= 3 params, no magic numbers (name every constant), no nested ternaries. Keep helpers small from the first GREEN so BLUE is genuinely a marker. The existing `editor-shell.test.tsx` max-lines warning is pre-existing; do not add net-new warnings.
- **Node verification caveat:** the schema logic and every Vitest test run on the current Node 20 (Vitest resolves TS through Vite). The plain-`node` pack CLI importing `core/` TS needs Node >= 22.18 (native unflagged type stripping). After Task 1's bump, run `nvm install 22 && nvm use` in this worktree before the CLI smoke steps. If the CLI smoke cannot run (shell still on Node 20), land the code and defer that one live check to the owner's Node-22 environment; the Vitest parity tests still prove the schema.

## File structure

| File                                                                                                         | Responsibility                                                                                           | Status        |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------- |
| `.nvmrc`, `package.json` (engines)                                                                           | Bump Node to 22 LTS (`>= 22.18.0`).                                                                      | Modify        |
| `core/assets/license-policy.ts` (+ `.test.ts`)                                                               | Graduated curated open-license policy. Runtime-self-contained (type-only cross-imports).                 | Create        |
| `core/assets/pack-manifest.ts` (+ `.test.ts`)                                                                | Graduated `AssetKind`, `ASSET_KINDS`, `validatePackManifest`. Runtime-self-contained.                    | Create        |
| `scripts/pack/license-policy.mjs`, `scripts/pack/manifest-validation.mjs`                                    | Replaced by thin re-exports of the `core/` `.ts` (or removed and importers repointed).                   | Modify/Delete |
| `scripts/pack/vernacular-pack.mjs`, `scripts/pack/pack-integrity.mjs`                                        | Import the schema/policy from `core/assets/*.ts`.                                                        | Modify        |
| `core/model/types.ts`                                                                                        | Add `FurnitureInstance`; add `furniture: FurnitureInstance[]` to `Floor`.                                | Modify        |
| `core/model/factories.ts`                                                                                    | Add `createFurnitureInstance`; `createFloor` seeds `furniture: []`; bump `CURRENT_SCHEMA_VERSION` to 10. | Modify        |
| `core/migrations/schema/add-floor-furniture.ts` (+ `.test.ts`)                                               | `v9 -> v10` backfill of `furniture: []`.                                                                 | Create        |
| `core/migrations/schema/index.ts`                                                                            | Register `addFloorFurnitureMigration`.                                                                   | Modify        |
| `core/commands/handlers/furniture-commands.ts` (+ `.test.ts`)                                                | Place/move/rotate/resize/remove furniture commands + `registerFurnitureCommands`.                        | Create        |
| `core/commands/*` (assembly)                                                                                 | Call `registerFurnitureCommands` alongside `registerOpeningCommands` (grep the call site).               | Modify        |
| `core/index.ts`                                                                                              | Export the new model type, factory, commands, and asset-library types.                                   | Modify        |
| `storage/assets/asset-source.ts`                                                                             | Widen with `LibraryItem`, optional `list`, `readThumbnail`.                                              | Modify        |
| `storage/assets/asset-registry.ts`                                                                           | Add `list()` aggregation across sources.                                                                 | Modify        |
| `storage/assets/pack-source.ts` (+ `.test.ts`)                                                               | Read a pack (manifest + files) into `LibraryItem`s and bytes.                                            | Create        |
| `storage/assets/user-source.ts` (+ `.test.ts`)                                                               | User imports over the cache + a metadata index; `put`, `list`, `read`.                                   | Create        |
| `storage/library-store.ts`                                                                                   | Extend the user metadata index contract (persisted entries).                                             | Modify        |
| `storage/indexeddb/*`                                                                                        | Persist the user library index.                                                                          | Modify/Create |
| `public/packs/vernacular-starter-1.0.0/`                                                                     | Bundled starter pack static files (manifest, asset, thumbnail).                                          | Create        |
| `storage/service-worker/shell-cache.ts`                                                                      | Precache the starter pack manifest + thumbnail.                                                          | Modify        |
| `bridge/react/asset-registry-context.ts` (+ `.test.tsx`)                                                     | Provide the `AssetRegistry` to React.                                                                    | Create        |
| `editor/library/library-panel.tsx` (+ `.test.tsx`, `.css`)                                                   | Left-docked browser: search, source toggle, filters, grid, import, empty state.                          | Create        |
| `editor/library/library-launcher.tsx` (+ `.test.tsx`)                                                        | Tool-rail Furniture launcher.                                                                            | Create        |
| `editor/library/use-furniture-import.ts` (+ `.test.ts`)                                                      | GLB signature check + hash + cache + index.                                                              | Create        |
| `editor/plan/place-furniture.ts` (+ `.test.ts`)                                                              | Ghost geometry + drop, mirroring `place-opening.ts`.                                                     | Create        |
| `editor/plan/draw-furniture.ts` (+ `.test.ts`)                                                               | Footprint symbol + label render.                                                                         | Create        |
| `editor/plan/use-furniture-placement.ts`                                                                     | Tool interaction, mirroring `use-opening-placement.ts`.                                                  | Create        |
| `editor/plan/furniture-inspector.tsx` (+ `.test.tsx`)                                                        | Angle, footprint, and name editors.                                                                      | Create        |
| `editor/tools/active-tool-context.ts`                                                                        | Add `'place-furniture'` to `ToolId`.                                                                     | Modify        |
| `editor/shell/editor-shell.tsx`                                                                              | Add the library launcher to `ToolRail`; `toolLabel` case.                                                | Modify        |
| selection wiring (`editor/plan/selection-entities.ts`, `hit-test.ts`, `move-drag.ts`, `overlay-entities.ts`) | Make furniture a selectable, movable, deletable, announced entity.                                       | Modify        |
| `docs/knowledge/decisions/ADR-0092-furniture-instance-model.md`                                              | Furniture model + `v10` migration.                                                                       | Create        |
| `docs/knowledge/decisions/ADR-0093-in-app-asset-library.md`                                                  | Graduation to `core/`, sources/registry, Node bump, starter pack.                                        | Create        |
| `docs/knowledge/decisions/ADR-0024-*.md`                                                                     | Status note: graduated by ADR-0093.                                                                      | Modify        |
| `e2e/tests/journeys/place-furniture.spec.ts`                                                                 | Open library, place a starter piece, see it, axe-clean.                                                  | Create        |

## Module contracts (target signatures)

These signatures are the shared contract. The implementer reproduces them; the test-author writes to them from the public types and JSDoc.

### `core/assets/pack-manifest.ts` and `core/assets/license-policy.ts`

Straight port of `scripts/pack/manifest-validation.mjs` and `scripts/pack/license-policy.mjs` to TypeScript, behavior identical. Both must be runtime-self-contained: any cross-module reference is `import type` (elided by `verbatimModuleSyntax`) so plain `node` can load them via type stripping with nothing to resolve at runtime.

```ts
// license-policy.ts
export const RECOGNIZED_LICENSES: readonly string[]
export const SHARE_ALIKE_LICENSES: readonly string[]
export const NON_REDISTRIBUTABLE_LICENSES: readonly string[]
export function recognize(licenseId: string): boolean
export function isShareAlike(licenseId: string): boolean
export function isNoRedistribution(licenseId: string): boolean
export function licenseProblems(licenseId: string): string[]
export function shareAlikeWarning(licenseIds: readonly string[]): string | null

// pack-manifest.ts
export type AssetKind =
  | 'furniture'
  | 'architectural-element'
  | 'trim-profile'
  | 'stair-component'
  | 'material'
  | 'texture'
  | 'underlay-image'
  | 'palette'
  | 'preview-only'
export const ASSET_KINDS: readonly AssetKind[]
export interface PackValidationResult {
  valid: boolean
  errors: string[]
}
export function validatePackManifest(manifest: unknown): PackValidationResult
```

### `core/model/types.ts` (additions)

```ts
export interface FurnitureFootprint {
  width: number // mm
  depth: number // mm
}

export interface FurnitureInstance {
  id: string
  assetRef: AssetReference
  position: Point // plan coordinates, mm
  rotation: number // degrees, free angle (not snapped)
  elevationZ: number // mm above the floor; 0 sits on the floor
  footprint: FurnitureFootprint
  name?: string
  customizations?: Record<string, unknown> // reserved; spec 4.11
}

// Floor gains:
//   furniture: FurnitureInstance[]
```

### `core/model/factories.ts` (additions)

```ts
export const DEFAULT_FURNITURE_FOOTPRINT_MM: FurnitureFootprint // e.g. { width: 600, depth: 600 }

export interface NewFurnitureOptions {
  assetRef: AssetReference
  position: Point
  footprint: FurnitureFootprint
  rotation?: number
  elevationZ?: number
  name?: string
  id?: string
}
export function createFurnitureInstance(options: NewFurnitureOptions): FurnitureInstance
// createFloor(...) seeds furniture: []
// CURRENT_SCHEMA_VERSION = 10
```

### `core/commands/handlers/furniture-commands.ts`

Mirrors `opening-commands.ts` (a `mapTargetFurniture` helper, `Command`/`CommandHandler`, `registerFurnitureCommands`).

```ts
export const PLACE_FURNITURE = 'floor/place-furniture'
export interface PlaceFurnitureParams {
  floorId: string
  furniture: FurnitureInstance
}
export function placeFurniture(
  floorId: string,
  furniture: FurnitureInstance,
): Command<PlaceFurnitureParams>

export const MOVE_FURNITURE = 'floor/move-furniture'
export interface MoveFurnitureParams {
  floorId: string
  furnitureId: string
  position: Point
}
export function moveFurniture(
  floorId: string,
  furnitureId: string,
  position: Point,
): Command<MoveFurnitureParams>

export const ROTATE_FURNITURE = 'floor/rotate-furniture'
export interface RotateFurnitureParams {
  floorId: string
  furnitureId: string
  rotation: number
}
export function rotateFurniture(
  floorId: string,
  furnitureId: string,
  rotation: number,
): Command<RotateFurnitureParams>

export const RESIZE_FURNITURE = 'floor/resize-furniture'
export interface ResizeFurnitureParams {
  floorId: string
  furnitureId: string
  footprint: FurnitureFootprint
}
export function resizeFurniture(
  floorId: string,
  furnitureId: string,
  footprint: FurnitureFootprint,
): Command<ResizeFurnitureParams>

export const REMOVE_FURNITURE = 'floor/remove-furniture'
export interface RemoveFurnitureParams {
  floorId: string
  furnitureId: string
}
export function removeFurniture(
  floorId: string,
  furnitureId: string,
): Command<RemoveFurnitureParams>

export function registerFurnitureCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project>
```

(A rename uses a `name` edit; fold it into `RESIZE`/a dedicated `RENAME_FURNITURE` only if the Inspector name editor needs its own command. Prefer one `setFurnitureName` command for clarity.)

### `storage/assets/asset-source.ts` (widened) and `asset-registry.ts`

```ts
export interface LibraryItem {
  reference: AssetReference
  name: string
  kind: AssetKind
  categories: string[]
  eras: string[]
  footprint: FurnitureFootprint
  thumbnail?: AssetReference
}

export interface AssetSource {
  readonly id: string
  read(contentHash: string): Promise<Uint8Array | undefined>
  list?(): Promise<LibraryItem[]>
  readThumbnail?(contentHash: string): Promise<Uint8Array | undefined>
}

// AssetRegistry gains:
//   list(): Promise<LibraryItem[]>   // concatenates each source's list(), user before pack
```

### `storage/assets/pack-source.ts` and `user-source.ts`

```ts
// A reader seam so the source is unit-tested without fetch/fs.
export interface PackReader {
  manifest(): Promise<unknown> // parsed manifest.json
  readAsset(contentHash: string): Promise<Uint8Array | undefined> // assets/<hash>.glb
  readThumbnail(contentHash: string): Promise<Uint8Array | undefined> // thumbnails/<hash>.webp
}
export class PackSource implements AssetSource {
  constructor(reader: PackReader)
  // id = `pack:${packId}@${version}`; list() validates the manifest and maps assets -> LibraryItem
}

export interface UserLibraryIndex {
  list(): Promise<LibraryItem[]>
  add(item: LibraryItem): Promise<void>
}
export class UserSource implements AssetSource {
  constructor(cache: AssetCache, index: UserLibraryIndex)
  // id = 'user'; put(bytes, meta) hashes, caches, indexes; read() from cache; list() from index
}
```

### `editor/plan/place-furniture.ts`

```ts
// Mirrors place-opening.ts: pure geometry for the ghost + the drop.
export interface FurnitureGhost {
  position: Point
  rotation: number
  footprint: FurnitureFootprint
}
export function furnitureGhostAt(
  point: Point,
  rotation: number,
  footprint: FurnitureFootprint,
): FurnitureGhost
export const FURNITURE_ROTATION_STEP_DEGREES = 15 // coarse step for the R key
export function rotatedBy(rotation: number, deltaDegrees: number): number // normalized to [0, 360)
```

---

## Task 1: Node bump and pack-schema graduation to `core/`

**Allowed files (per cycle as noted):** `.nvmrc`, `package.json`, `core/assets/license-policy.ts(.test.ts)`, `core/assets/pack-manifest.ts(.test.ts)`, `scripts/pack/license-policy.mjs`, `scripts/pack/manifest-validation.mjs`, `scripts/pack/vernacular-pack.mjs`, `scripts/pack/pack-integrity.mjs`, `core/index.ts`.

### Step 1.0: Node bump (`build:`, exempt from RGB)

- [ ] Set `.nvmrc` to `22`. Set `package.json` engines `node` to `>= 22.18.0`. CI reads `.nvmrc` (ci.yml, mutation.yml), so no workflow edit is needed.
- [ ] In this worktree: `nvm install 22 && nvm use`. Confirm `node --version` >= 22.18.
- [ ] Commit `build: require Node 22 for native TypeScript in the pack CLI (#174)`.

### Cycle 1.1: graduate the license policy (port)

The port keeps behavior identical, so the ported tests are the #173 license-policy tests translated to TypeScript.

- [ ] **RED** `test:` Create `core/assets/license-policy.test.ts` covering every outcome already proven in `scripts/pack/license-policy.test.mjs`: `recognize` true for each `RECOGNIZED_LICENSES` and false for `'Weird-1.0'`; `isShareAlike`/`isNoRedistribution` on representative ids; `licenseProblems('CC0-1.0') === []`, `licenseProblems('Weird-1.0')` contains `not a recognized`, `licenseProblems('CC-BY-NC-4.0')` contains `forbids redistribution`; `shareAlikeWarning(['CC-BY-SA-4.0','CC0-1.0'])` contains `share-alike`, `shareAlikeWarning(['CC0-1.0','MIT'])` and `shareAlikeWarning(['CC-BY-SA-4.0','CC-BY-SA-4.0'])` are `null`.

Run: `pnpm exec vitest run core/assets/license-policy.test.ts` -> FAIL (module missing).

- [ ] **GREEN** `feat:` Create `core/assets/license-policy.ts` porting the `.mjs` logic to TypeScript (typed signatures from the contract, no behavior change).
- [ ] **BLUE** `refactor:` marker or small tidy. Gate + audit.

### Cycle 1.2: graduate the manifest validator (port)

- [ ] **RED** `test:` Create `core/assets/pack-manifest.test.ts` covering the cases in `scripts/pack/manifest-validation.test.mjs`: required top-level fields, SemVer, pack-level `eras`/`categories`, per-asset `contentHash` (sha256), `name`, `license` (delegated to the policy), `attribution`, `eras`, `categories`, optional `sourceUrl`, `kind` in `ASSET_KINDS`, and `dimensions` bounds. Assert `ASSET_KINDS` includes `'furniture'`.
- [ ] **GREEN** `feat:` Create `core/assets/pack-manifest.ts` porting the validator and `ASSET_KINDS`, importing `licenseProblems` from `./license-policy` (value import; both stay in `core/assets/` so the CLI loads the pair via type stripping; if `node` cannot resolve the extensionless sibling at runtime, use an explicit `'./license-policy.ts'` specifier in the file the CLI imports).
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 1.3: repoint the CLI and remove the duplicates (`refactor:`, behavior-preserving)

This is a relocation: the CLI's behavior and its existing tests stay green, so it lands as `refactor:` commits (exempt from the test->feat sequence).

- [ ] **Step 1** In `scripts/pack/vernacular-pack.mjs` and `scripts/pack/pack-integrity.mjs`, import `validatePackManifest` / `ASSET_KINDS` / license functions from `../../core/assets/pack-manifest.ts` and `../../core/assets/license-policy.ts` (explicit `.ts` so plain `node` resolves them). Remove `scripts/pack/manifest-validation.mjs` and `scripts/pack/license-policy.mjs` (or reduce each to a one-line `export * from '../../core/assets/...ts'` if any other `.mjs` still imports the old path; grep first).
- [ ] **Step 2** Repoint `scripts/pack/*.test.mjs` that imported the removed modules at the `core/` `.ts` (Vitest resolves these on Node 20).
- [ ] **Step 3** Run `pnpm exec vitest run scripts/pack core/assets` -> all green. Commit `refactor: graduate the pack manifest schema to core (#174)`.
- [ ] **Step 4 (Node 22 smoke; see caveat)** With Node >= 22.18: `pnpm pack:validate tests/fixtures/packs/vernacular-starter-1.0.0` exits 0 and `... broken-pack-wrong` exits 1. If the shell is still Node 20, note this check as deferred to the owner's Node-22 run; the Vitest parity above covers the logic.
- [ ] **Step 5** Export the new types from `core/index.ts` (`AssetKind`, `validatePackManifest`, `ASSET_KINDS`). Gate + audit.

---

## Task 2: Furniture instance model and the `v9 -> v10` migration

**Allowed files:** `core/model/types.ts`, `core/model/factories.ts`, `core/model/factories.test.ts`, `core/migrations/schema/add-floor-furniture.ts(.test.ts)`, `core/migrations/schema/index.ts`, `core/index.ts`.

### Cycle 2.1: the model type and factory

- [ ] **RED** `test:` In `core/model/factories.test.ts`, `createFurnitureInstance({ assetRef, position: {x:100,y:200}, footprint: {width:500,depth:520} })` returns an object with a generated `id`, the given `assetRef`/`position`/`footprint`, `rotation === 0`, `elevationZ === 0`, and `name` absent; passing `rotation`, `elevationZ`, `name`, `id` carries them through.
- [ ] **GREEN** `feat:` Add `FurnitureFootprint` and `FurnitureInstance` to `core/model/types.ts` and `createFurnitureInstance` + `DEFAULT_FURNITURE_FOOTPRINT_MM` to `factories.ts`.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 2.2: floors carry furniture

- [ ] **RED** `test:` `createFloor('Ground')` returns a floor with `furniture: []` (alongside `walls`, `underlays`, `openings`, `dimensions`).
- [ ] **GREEN** `feat:` Add `furniture: FurnitureInstance[]` to `Floor` in `types.ts`; seed `furniture: []` in `createFloor`.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 2.3: the `v9 -> v10` migration

- [ ] **RED** `test:` Create `add-floor-furniture.test.ts`: a `from: 9` document whose floors lack `furniture` migrates so every floor gains `furniture: []`; a floor with an existing `furniture` array is preserved unchanged; a document with non-array `floors` passes through. Mirror `add-floor-openings.test.ts`.
- [ ] **GREEN** `feat:` Create `add-floor-furniture.ts` (`from: 9`) mirroring `addFloorOpeningsMigration`, backfilling only when absent and not touching `meta.schemaVersion`.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 2.4: register the migration and bump the version

- [ ] **RED** `test:` Migrating a minimal `v9` project to current yields `meta.schemaVersion === 10` with `furniture: []` on each floor (a `migrate.test.ts` case or a focused test). Assert `CURRENT_SCHEMA_VERSION === 10`.
- [ ] **GREEN** `feat:` Add `addFloorFurnitureMigration` to `SCHEMA_MIGRATIONS` in `core/migrations/schema/index.ts`; bump `CURRENT_SCHEMA_VERSION` to 10 and extend the version comment in `factories.ts` (`v10 adds the per-floor furniture array`).
- [ ] **BLUE** `refactor:` marker. Confirm the round-trip and strict-profile tests still pass (a new floor field may need the validator/schema updated; if `core/format` strict validation rejects unknown `furniture`, add it there in this GREEN). Gate + audit.

### Cycle 2.5: export

- [ ] **Step** Export `FurnitureInstance`, `FurnitureFootprint`, `createFurnitureInstance` from `core/index.ts`. `refactor:`/`feat:` as a tiny barrel update. Gate + audit.

---

## Task 3: Furniture commands

**Allowed files:** `core/commands/handlers/furniture-commands.ts(.test.ts)`, the command-registry assembly file (grep `registerOpeningCommands(` for the call site), `core/index.ts`.

One cycle per command, each mirroring the matching opening command. Use a shared `mapTargetFurniture(floor, id, update)` helper like `mapTargetOpening`.

### Cycle 3.1: place

- [ ] **RED** `test:` `placeFurniture(floorId, instance)` builds a `Command` with `type === PLACE_FURNITURE` and the params; applying its handler appends the instance to the floor's `furniture` and leaves other floors reference-equal.
- [ ] **GREEN** `feat:` Add `PLACE_FURNITURE`, `placeFurniture`, `placeFurnitureHandler`, and `registerFurnitureCommands` (registering place for now).
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 3.2: move

- [ ] **RED** `test:` applying `moveFurniture` sets `position` on the target instance only.
- [ ] **GREEN** `feat:` Add `MOVE_FURNITURE` + handler via `mapTargetFurniture`; register it.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 3.3: rotate

- [ ] **RED** `test:` applying `rotateFurniture` sets `rotation` on the target only.
- [ ] **GREEN** `feat:` Add `ROTATE_FURNITURE` + handler; register it.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 3.4: resize footprint

- [ ] **RED** `test:` applying `resizeFurniture` replaces `footprint` on the target only.
- [ ] **GREEN** `feat:` Add `RESIZE_FURNITURE` + handler; register it.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 3.5: set name

- [ ] **RED** `test:` applying `setFurnitureName` sets `name` on the target only; an empty string clears it (omits the field).
- [ ] **GREEN** `feat:` Add `SET_FURNITURE_NAME` + handler; register it.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 3.6: remove

- [ ] **RED** `test:` applying `removeFurniture` filters the target out of `furniture`.
- [ ] **GREEN** `feat:` Add `REMOVE_FURNITURE` + handler; register it. Wire `registerFurnitureCommands` into the assembly beside `registerOpeningCommands`; export from `core/index.ts`.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

---

## Task 4: Asset sources and the registry listing

**Allowed files:** `storage/assets/asset-source.ts`, `storage/assets/asset-registry.ts`, `storage/assets/asset-registry.test.ts`, `storage/assets/pack-source.ts(.test.ts)`, `storage/assets/user-source.ts(.test.ts)`, `storage/library-store.ts`, `storage/index.ts`, `core/index.ts` (for `LibraryItem` re-export if it lives in core; keep `LibraryItem` in `storage/assets` next to `AssetSource`).

### Cycle 4.1: widen the source surface and aggregate listing

- [ ] **RED** `test:` In `asset-registry.test.ts`, two in-memory sources each returning a `list()` of one `LibraryItem`; `registry.list()` returns both, the `user` source's items before the `pack` source's. A source without `list()` contributes nothing and does not throw. Existing `resolve()` tests stay green.
- [ ] **GREEN** `feat:` Add `LibraryItem` and the optional `list`/`readThumbnail` to `AssetSource`; add `AssetRegistry.list()` concatenating `await source.list?.() ?? []` in precedence order.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 4.2: `PackSource` lists a validated manifest

- [ ] **RED** `test:` A fake `PackReader` whose `manifest()` returns a valid one-asset starter manifest; `new PackSource(reader).list()` returns one `LibraryItem` with the asset `name`, `kind`, `categories`, `eras`, a `footprint` from `dimensions.width/depth`, a `thumbnail` reference, and a `reference` whose scope is `pack:vernacular-starter@1.0.0`. A manifest failing `validatePackManifest` yields `[]` (and does not throw).
- [ ] **GREEN** `feat:` Implement `PackSource` over `PackReader`, using `validatePackManifest` from `core`, mapping assets to `LibraryItem`, and `read`/`readThumbnail` delegating to the reader.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 4.3: `UserSource` stores and lists imports

- [ ] **RED** `test:` `new UserSource(cache, index)`; `put(bytes, { name, footprint, kind:'furniture', eras:[], categories:[] })` hashes the bytes (sha256), `cache.put`s them under that hash, and `index.add`s a `LibraryItem` with `reference.scope === 'user'`; `list()` returns the index items; `read(hash)` returns the cached bytes.
- [ ] **GREEN** `feat:` Implement `UserSource` and the `UserLibraryIndex` contract; extend `storage/library-store.ts` for the persisted entry shape.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 4.4: persist the user index

- [ ] **RED** `test:` An IndexedDB-backed (or fake-IDB) `UserLibraryIndex` round-trips an added item across a fresh instance.
- [ ] **GREEN** `feat:` Implement the persisted index under `storage/indexeddb/` mirroring the existing IDB stores.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

---

## Task 5: Starter pack, service worker, and the bridge context

**Allowed files:** `public/packs/vernacular-starter-1.0.0/**`, a generator script if needed, `storage/service-worker/shell-cache.ts(.test.ts)`, `bridge/react/asset-registry-context.ts(.test.tsx)`, app boot wiring (`app/*`).

### Step 5.0: bundle the starter pack (`test:`/`build:` data)

- [ ] Copy the #173 `vernacular-starter-1.0.0` fixture (manifest + `assets/<hash>.glb` + `thumbnails/<hash>.webp` + LICENSE/NOTICE/CHANGELOG.md) into `public/packs/vernacular-starter-1.0.0/`. Confirm it serves as static files under the dev server. Commit `feat: bundle the starter furniture pack (#174)`.

### Cycle 5.1: a fetch-backed `PackReader` for the bundled pack

- [ ] **RED** `test:` A `PackReader` built from a base URL and an injected `fetch` reads `manifest.json`, `assets/<hash>.glb`, and `thumbnails/<hash>.webp` from that base, returning `undefined` for a 404.
- [ ] **GREEN** `feat:` Implement `createFetchPackReader(baseUrl, fetchFn)` in `storage/assets/`.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 5.2: service-worker precache

- [ ] **RED** `test:` The shell-cache precache list includes the starter pack `manifest.json` and its thumbnail path.
- [ ] **GREEN** `feat:` Add those paths to `storage/service-worker/shell-cache.ts`.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 5.3: the React provider

- [ ] **RED** `test:` `asset-registry-context.test.tsx`: a component calling `useAssetRegistry()` inside `AssetRegistryProvider value={registry}` reads it; outside a provider it falls back to an empty registry (mirror `asset-cache-context.ts`).
- [ ] **GREEN** `feat:` Implement `AssetRegistryProvider` + `useAssetRegistry`. Wire the real registry (starter `PackSource` + `UserSource`) at app boot beside the asset cache.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

---

## Task 6: Custom GLB import and project serialization

**Allowed files:** `editor/library/use-furniture-import.ts(.test.ts)`, the import-to-source wiring, and a serialization test under `storage/`.

### Cycle 6.1: GLB signature gate

- [ ] **RED** `test:` `isGlb(bytes)` true for bytes starting with the glTF magic (`0x67 0x6C 0x54 0x46`, "glTF"); false for other bytes. Name the magic constant.
- [ ] **GREEN** `feat:` Implement `isGlb` in `use-furniture-import.ts` (or a small `glb.ts`).
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 6.2: import stores and indexes

- [ ] **RED** `test:` `importFurnitureGlb(file, userSource)` rejects a non-GLB file with a clear error; for a valid GLB it puts the bytes (hashed) into the user source with the file-derived name and the default footprint, returning the new `LibraryItem`.
- [ ] **GREEN** `feat:` Implement `importFurnitureGlb` over `UserSource.put`, deriving the name from the file name and the footprint from `DEFAULT_FURNITURE_FOOTPRINT_MM`.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 6.3: promote a placed user asset into the project on save

- [ ] **RED** `test:` A serialization test (`storage/`): build a project with a floor holding a `FurnitureInstance` whose `assetRef.scope === 'user'`, with the bytes only in the user cache; save through the `.building` bundle path; reopen from the bundle bytes alone and resolve the asset successfully (the bytes travelled in `assets/<hash>`). Assert it is absent from the bundle if promotion is skipped (guards the wiring).
- [ ] **GREEN** `feat:` On save, collect `assetRef`s referenced by the document's furniture (and underlays) and copy any user-scoped bytes into the project's asset store (the `DirectoryAssetCache`/folder the bundle zips). Reference `assets/<hash>`; do not inline.
- [ ] **BLUE** `refactor:` Extract a small `collectReferencedAssets(project)` helper. Gate + audit.

---

## Task 7: The library panel, the placement tool, and selection

**Allowed files (per cycle):** `editor/library/*`, `editor/plan/place-furniture.ts(.test.ts)`, `editor/plan/draw-furniture.ts(.test.ts)`, `editor/plan/use-furniture-placement.ts`, `editor/plan/furniture-inspector.tsx(.test.tsx)`, `editor/tools/active-tool-context.ts`, `editor/shell/editor-shell.tsx`, and the selection files listed in the file table.

### Cycle 7.1: ghost geometry (pure)

- [ ] **RED** `test:` `furnitureGhostAt({x:100,y:200}, 90, {width:500,depth:520})` returns the position, rotation, and footprint; `rotatedBy(350, 15)` returns `5` (wraps); `rotatedBy(10, -15)` returns `355`; `FURNITURE_ROTATION_STEP_DEGREES === 15`.
- [ ] **GREEN** `feat:` Implement `place-furniture.ts` pure helpers.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 7.2: footprint render (pure draw inputs)

- [ ] **RED** `test:` `furnitureSymbol(instance)` (in `draw-furniture.ts`) returns the rectangle corners for the footprint at the position and rotation, plus the label text (the `name` or a default). Pure geometry, no canvas.
- [ ] **GREEN** `feat:` Implement `draw-furniture.ts` geometry; integrate into the plan render layer.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 7.3: the `place-furniture` tool id and label

- [ ] **RED** `test:` `ToolId` accepts `'place-furniture'`; `toolLabel('place-furniture')` returns a human label (a `editor-shell.test.tsx`/tools test).
- [ ] **GREEN** `feat:` Add `'place-furniture'` to `ToolId` and the `toolLabel` case.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 7.4: the library panel lists and filters

- [ ] **RED** `test:` `library-panel.test.tsx`: rendered with a registry of two items (one user, one pack), the panel shows both names; typing in search filters by name; toggling the source toggle to "Yours" shows only the user item; an era filter chip narrows the grid; the empty "Yours" state shows the import affordance. axe: no violations.
- [ ] **GREEN** `feat:` Implement `library-panel.tsx` reading `useAssetRegistry().list()`, with search, source toggle, category/era chips, the thumbnail grid (thumbnails resolved through the registry), and the import button. Mirror `underlay-menu.tsx` for structure and dismissal.
- [ ] **BLUE** `refactor:` Split row/grid/filter subcomponents to stay under the line caps. Gate + audit.

### Cycle 7.5: the tool-rail launcher

- [ ] **RED** `test:` `library-launcher.test.tsx`: a button labelled "Furniture" with the dropdown a11y attributes opens the panel; the launcher sits in the `ToolRail`.
- [ ] **GREEN** `feat:` Implement `library-launcher.tsx`; add it to `ToolRail` in `editor-shell.tsx` near `UnderlayMenuPanel`.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 7.6: arming and dropping

- [ ] **RED** `test:` Picking a library item sets the active tool to `'place-furniture'` and arms that item; a plan click while armed dispatches `placeFurniture(activeFloorId, instance)` with the cursor position and the armed footprint; `Escape` disarms; the tool stays armed after a drop. Drive through `use-furniture-placement` with a fake dispatch.
- [ ] **GREEN** `feat:` Implement `use-furniture-placement.ts` mirroring `use-opening-placement.ts`, plus the armed-item state and the ghost render on the plan.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 7.7: rotate during placement

- [ ] **RED** `test:` Pressing `R` while armed advances the ghost rotation by `FURNITURE_ROTATION_STEP_DEGREES`; the dropped instance carries that rotation.
- [ ] **GREEN** `feat:` Handle `R` in the placement interaction via `rotatedBy`.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 7.8: selection, move, delete, undo

- [ ] **RED** `test:` A placed instance is hit-tested and selectable; a selection drag dispatches `moveFurniture`; `Delete` dispatches `removeFurniture`; the overlay announces the selected piece (a11y). Cover through the selection/hit-test units.
- [ ] **GREEN** `feat:` Add furniture to `selection-entities.ts`, `hit-test.ts`, `move-drag.ts`, and `overlay-entities.ts` as an entity kind, reusing the opening/wall paths.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 7.9: the inspector editors

- [ ] **RED** `test:` `furniture-inspector.test.tsx`: with a selected instance, editing the angle field dispatches `rotateFurniture`; editing width/depth dispatches `resizeFurniture`; editing the name dispatches `setFurnitureName`. Inputs reflect the current values.
- [ ] **GREEN** `feat:` Implement `furniture-inspector.tsx` mirroring `wall-thickness-editor.tsx`/`room-name-editor.tsx`; show it in the Inspector when a furniture instance is selected.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

---

## Task 8: ADRs, end-to-end journey, and final verification

**Allowed files:** `docs/knowledge/decisions/ADR-0092-*.md`, `ADR-0093-*.md`, `ADR-0024-*.md`, `e2e/tests/journeys/place-furniture.spec.ts`.

### Step 8.1: ADR-0092 (furniture instance model)

- [ ] Write `ADR-0092-furniture-instance-model.md`: status accepted/landed; context (the model had no placed objects; spec section 3 lists `floors[].furniture[]`); decision (`FurnitureInstance` fields including `elevationZ` reserved-for-mounting and `customizations`, the `v9 -> v10` backfill migration, free-angle rotation); consequences (3D rendering rides #175; per-instance height overrides ride `customizations`). Run the prose through the `humanizer` skill. Commit `docs: ADR-0092 furniture instance model (#174)`.

### Step 8.2: ADR-0093 (in-app asset library)

- [ ] Write `ADR-0093-in-app-asset-library.md`: the schema graduation to `core/` (with the Node 22 native-type-stripping decision and why, ADR-0024 closure), the widened `AssetSource`, the `PackSource`/`UserSource`/registry listing, the bundled starter pack served as static files and service-worker precached, and custom import with project-scope promotion on save. Humanize. Commit `docs: ADR-0093 in-app asset library and schema graduation (#174)`.

### Step 8.3: close ADR-0024

- [ ] Add a status note + `updated` date to `ADR-0024`: the schema graduated to `core/` in ADR-0093. Commit `docs: note the schema graduation in ADR-0024 (#174)`.

### Step 8.4: end-to-end journey

- [ ] **RED** `test:` `e2e/tests/journeys/place-furniture.spec.ts`: open the Furniture launcher, pick the starter chair, click the plan to place it, assert the footprint/label appears, run the axe-core no-violations check. (Follow the underlay journey's setup and the e2e conventions.)
- [ ] **GREEN** Make any small wiring fixes the journey surfaces.
- [ ] **BLUE** `refactor:` marker.

### Final verification (before declaring done)

- [ ] `pnpm typecheck` clean.
- [ ] `pnpm lint` clean (0 errors; no net-new warnings beyond the pre-existing `editor-shell.test.tsx`).
- [ ] `pnpm format:check` clean.
- [ ] `pnpm test` green (full unit suite).
- [ ] `pnpm build` succeeds.
- [ ] `pnpm rgb:audit origin/main..HEAD` clean.
- [ ] e2e: the new place-furniture journey plus the existing underlay/axe journeys pass (`pnpm exec playwright test ...`).
- [ ] Node 22 CLI smoke: `pnpm pack:validate` exits 0 on the starter fixture and 1 on the broken fixture (run under Node >= 22.18; defer to the owner if the shell is still Node 20).
- [ ] Working tree clean.

## Self-review against the spec

- Graduate the schema to `core/` (spec slice 1) -> Task 1. Covered (with the Node bump the owner chose).
- `FurnitureInstance` + `elevationZ` + `Floor.furniture[]` + migration + factories + ADR (slice 2) -> Tasks 2 and 8.1. Covered.
- Widen the existing `AssetSource`/`AssetRegistry`, add `PackSource`/`UserSource`, listing, bridge context (slice 3) -> Tasks 4 and 5.3. Covered.
- Starter pack as static files + service-worker precache (slice 3) -> Task 5. Covered.
- Library browser panel + launcher + search/toggle/filters/grid/import/empty + a11y (slice 4) -> Tasks 7.4, 7.5. Covered.
- Custom GLB import: signature, hash, cache, user index; promote on save (slice 5) -> Tasks 6 and 4.3, 4.4. Covered.
- `place-furniture` tool, `placeFurniture` command, footprint symbol, free-angle rotation with R + Inspector angle, selection/move/delete/undo (slice 6) -> Tasks 3, 7.1-7.3, 7.6-7.9. Covered.
- Verification (spec section): migration test (2.3), registry/source tests (4), import + serialization round-trip (6), placement tests (7), e2e journey (8.4), full chain (Final verification). Covered.
- Deferred items (3D render #175, thumbnail baking, GLB normalization, pack-by-URL, LRU/quota, parametric variants, export license summary, wall-flush/rotate-to-wall/overlap) carry no tasks by design and are recorded in ADR-0092/0093.
