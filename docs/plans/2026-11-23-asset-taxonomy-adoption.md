# Asset Taxonomy Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repository a task is one red-green-blue cycle: the `test-author` role commits one failing test, the `implementer` role commits the minimal code, and the `refactorer` role commits a refactor or an empty marker after the clean-code review.

**Goal:** The asset taxonomy exists in `core/` as data and as checks: two registries hold the thirty domains and the 410 categories, a catalog identifier and a sub-resource parse and format, the pack validator checks the classification fields and the dependency rule, and the library can filter by category. Everything that needs a new reader in the app is ordered behind the investigation or the other effort it waits for.

**Architecture:** Pure data and pure functions in `core/registries/` and `core/assets/`. The pack tool reaches them through `validatePackManifest`, as it does today. The shared validator checks grammar only. The pack tool checks that a category is in the registry, so an app built before a registry addition still opens a pack that uses it. The editor reads the category registry for the library filter. No project schema changes, no command, no new layer, and no new package.

**Tech Stack:** TypeScript, Vitest, React for the one editor pull request. No new package.

**Spec:** `docs/specs/2026-11-23-asset-taxonomy.md`. Decision records: ADR-0234, ADR-0235, ADR-0236, and ADR-0237, all current. The owner ruled on their decisions on 2026-11-23. Related work: `docs/plans/2026-11-22-asset-pack-distribution.md` (the distribution plan), `docs/specs/2026-11-14-architecture-refactor-round.md` (the refactor round), and `docs/plans/2026-11-19-texture-assets-in-packs.md`.

- Base: branch `docs/asset-taxonomy` at `7026280d`. Paths and signatures were read there.
- The four decision records are current, and the owner has ruled on every decision in them. "What each pull request still waits for" names the investigation or the other effort that each pull request waits on.
- The distribution plan and ADR-0229 are not merged at this base. ADR-0229 and ADR-0230 are in an open pull request (#1054), and ADR-0181, ADR-0199, and ADR-0201 to ADR-0203 are on a branch that has not merged. The records here depend on them. Where this plan consumes a name from the distribution plan, the pull request says so and lands after it.

## Global Constraints

- Layer rules of `.claude/rules.md` hold. Everything in pull requests 1 to 4 is in `core/` and imports no React, no Three.js, and no DOM global.
- Every asset reference stays `(scope, contentHash)` (ADR-0007). No pull request stores a catalog identifier in a project, resolves bytes by one, or keys a cache by one (ADR-0235).
- No project schema change. `CURRENT_SCHEMA_VERSION` stays 17 and `CURRENT_SCHEMA_REVISION` stays where the base has it. If a cycle seems to need a change to `core/model/types.ts`, stop and ask.
- `formatVersion` does not move in this plan. Every new manifest field is optional, and a pack with none of them validates exactly as before (ADR-0219, ADR-0236). The manifest schemas under `schema/pack-manifest/` are open: they name only checked fields, and an optional field is added in place with the same `$id`. Removing, retyping, or narrowing a property, or making one required, is a new format version.
- Lengths in a manifest are millimeters. A size or a volume is checked with `isPositiveLengthMm` from `core/assets/manifest-lengths.ts`. A position or a pivot can be zero or negative, so the first pull request that checks one adds a signed rule beside it (finite, absolute value at most `MAX_LENGTH_MM`). Angles are degrees.
- Manifest field names are camel case. Enumerated values are lower case with hyphens. Subcategories, slugs, and sub-resource names use underscores.
- The sub-resource separator in text is a tilde. No code path appends anything to a serialized `scope#contentHash`.
- No new package. If one proves unavoidable, stop and ask: the 30-day cooldown and exact pins apply.
- ESLint limits: functions of at most 40 lines, files of at most 300 lines, at most 3 parameters, no magic numbers.
- Text rules: no em dashes or en dashes, no names of other products, no internal shorthand, Conventional Commit subjects of at most 100 characters, no `Co-Authored-By` and no session trailer.
- The design specification under `docs/specs/2026-06-01-vernacular-design.md` is not edited by this plan.

## Review Focus

Conditions the specification implies and a reviewer should look for first. Each has a test in the cycle named.

1. A pack that exists today, with `categories: ["seating"]` and none of the new fields, still validates, and its tile still shows. Pull request 3 cycle 1 and cycle 3.
2. Text that looks like a sub-resource is never read as an asset reference, and a reference is never read as a sub-resource. Pull request 2 cycle 9.
3. The registry and the inventory of the specification cannot drift apart. Pull request 1 cycle 5.
4. A reference between two objects of tier 3 is refused, and a socket predicate that names a tier 3 category is accepted. Pull request 4 cycle 1 and pull request 2 cycle 6.
5. A version with build metadata, a leading zero, or two parts is refused in a catalog identifier, as is a numeric prerelease part with a leading zero. Pull request 2 cycle 2.
6. A category that is well formed but not in the registry passes the shared validator and is refused only by the pack tool, so an older app opens a newer pack. Pull request 3 cycle 3 and cycle 10.

---

## Facts this plan rests on

At `7026280d`:

- `validatePackManifest(manifest: unknown): PackValidationResult` (`core/assets/pack-manifest.ts`) is hand-written. It reads the fields it knows and ignores every other field. `PACK_FORMAT_VERSIONS` is `[1, 2]` and is not exported. `validateAsset` receives `{ label, formatVersion }` and pushes text errors labeled `assets[<n>].<field>`.
- `categories` is required and non-empty at pack level and at asset level. Its strings are not checked against anything.
- `validateTextureFields(source, label, errors)` (`core/assets/texture-asset-rules.ts`) is the shape a field group validator has.
- `Registry<T extends RegistryEntry>` is `{ version, entries }` with `createRegistry(version, entries)`, `getEntry(registry, id)`, and `mergeRegistries(base, overlay)` (`core/registries/registry.ts`). `mergeRegistries` has no production caller, and every registry is a constant in the code.
- `core/registries/` has no domain registry and no category registry. Design specification section 4.4 names a hierarchical category registry.
- `AssetReference` is `{ scope, contentHash }`. `formatAssetReference` writes `scope#contentHash`, and `parseAssetReference` splits at the last number sign (`core/model/asset-reference.ts`).
- `LibraryItem` (`storage/assets/asset-source.ts`, until pull request 3 of the distribution plan moves it) carries `categories: string[]`. `LibraryFilters` (`editor/library/library-filter.ts`) has `query`, `source`, `era`, and `style`. `furnitureItems` keeps items of kind `furniture` only. `matchesQuery` reads the name only.
- The pack tool (`scripts/pack/vernacular-pack.mjs`) knows `validate` and `build`, and imports `core/assets/*.ts` through explicit `.ts` paths.
- The starter manifest (`public/packs/vernacular-starter-1.0.0/manifest.json`) has `categories: ["seating"]` and `eras: ["mid-century"]`.
- `normalizeModelIntoBox(model, node)` (`engine/scene/furniture-model.ts`) placed a model at `(footprintCenter.x, node.elevationZ, footprintCenter.y)` and turned it by `-rotationRadians`, while the furniture box (`engine/scene/furniture-builder.ts`) goes through `planToWorld`, which maps plan y to world -Z (`core/scene/plan-to-world.ts`). The two disagreed, and the fix is on branch `fix/loaded-model-follows-plan-axes`, which routes the position through `planToWorld` and turns the model by `+rotationRadians`. It is not in the base.
- `FurnitureInstance` (`core/model/types.ts`) has no `extensions` field. Only an opening has a host (`hostWallId`).
- `ConstructionLayer` is `{ material: string; thickness: number }`, and only the sum of the thicknesses is used (`core/registries/construction-profiles.ts`, `core/scene/construction-profile.ts`).

## What this plan consumes from other plans

- From the distribution plan, pull request 1: `comparePackVersions(a, b)` (`core/assets/pack-version.ts`), and `ReadablePackAsset` with `readPackManifest` (`core/assets/pack-manifest-shape.ts`). Pull request 3 of this plan uses both.
- From the distribution plan, pull request 3 moves `LibraryItem` to `core/assets/library-item.ts`, and pull request 5 rebuilds the library panel. Pull request 5 of this plan edits the panel after it.
- From the distribution plan, pull request 13: the schema families under `schema/pack-manifest/`. Investigation B rules how an optional field reaches them.
- From the refactor round, stage 5: registries resolved at run time, the element reference `{ kind, id }`, the general host relation, and `extensions` on every kind. Pull request 6 and the deferred work wait for it.
- From the refactor round, stage 6: the 3D scene view object. Pull request 7 waits for it.

## Decisions left to the builder

Each is made once, here.

1. **Registry files.** `core/registries/asset-domains.ts` holds the thirty domains. The 410 categories are data in four files, one for each tier (`asset-categories-tier-1.ts` to `asset-categories-tier-4.ts`), so that no file passes 300 lines. `core/registries/asset-categories.ts` joins them into one registry.
2. **Category entry.** `AssetCategory { id, domain, subcategory, name }`, with `id` in the form `FFE.seating`. The registry keeps the order of the specification.
3. **Display names.** A name comes from the subcategory id: underscores become spaces and the first letter is a capital. A short table of written names covers ids where that reads badly (for example `LGT.ies_distributions` is "IES distributions"). Names are English only for now.
4. **Parse results.** A parser returns `{ ok: true, ... }` or `{ ok: false, problem: string }`. No parser throws. The problem text names the part that is wrong.
5. **The grammar does not read the registry.** `parseCatalogId` checks the pattern and the domain code. Neither it nor the shared validator checks that a category exists. The pack tool does (decision 6).
6. **Taxonomy form in `categories`.** A category string that starts with three capital letters and a full stop is taken as a taxonomy category. The shared validator checks its grammar only (`<DOMAIN>.<subcategory>` with the pattern of the registry ids). The pack tool (`scripts/pack/`) checks at build and validate time that it is in the registry. An app built before a registry addition therefore accepts a newer category and shows it as an unknown label. Any other string is a plain label and stays valid. The owner ruled this on 2026-11-23.
7. **Unknown keys.** A key the validator does not know stays ignored, inside `provenance` and `lifecycle` as elsewhere.
8. **Which formats.** The new fields are checked whenever they are present, in a pack of any known format.
9. **References are checked from their text.** The rank rule needs only the two domain codes, so a reference to an asset of another pack is checked the same way. Whether the named asset exists anywhere is not checked until the catalog work provides a way.
10. **Chips.** The library shows a row of category chips when its visible items carry two or more registry categories. A plain label gets no chip.
11. **No alias table.** The starter pack's `seating` stays a plain label until the next version of that pack is built, which then writes `FFE.seating`. An issue tracks it.

## What each pull request still waits for

Every decision the pull requests build is ruled, and investigations A, B, D, and I are answered. Each pull request below waits only on the work named in its row.

| Pull request                    | Record it builds   | What it still waits for                                                                                                      |
| ------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 1. Domain and category registry | ADR-0234           | Nothing. All 410 categories enter the registry at once.                                                                      |
| 2. Catalog identifier           | ADR-0235           | Nothing. An asset keeps its own version, the separator is a tilde, and `mfr_` is reserved and refused.                       |
| 3. Classification fields        | ADR-0235, ADR-0236 | Pull request 1 of the distribution plan (the publish step it extends).                                                       |
| 4. Dependency rule              | ADR-0234           | Pull request 3.                                                                                                              |
| 5. Library category filter      | ADR-0234           | Pull request 1, and pull request 5 of the distribution plan.                                                                 |
| 6. Layered assemblies           | ADR-0237           | Refactor stage 5. Investigation D is answered and the suggested default finish is ruled. Its cycles are written at dispatch. |
| 7. Declared pivot               | ADR-0236           | Refactor stage 6. The model placement defect is fixed on `fix/loaded-model-follows-plan-axes`, which lands first.            |

Rulings that need no pull request: element ids keep their form, the project id stays out of the document, the store layout of ADR-0229 stays flat with no extension, and a manifest length is in millimeters.

## Investigations before code

Each is one agent's task and ends in a written answer on the issue that tracks it. None commits code, except that investigation A commits its failing test if it reproduces.

- [x] **Investigation A: does a loaded model land where its box lands?** Read `engine/scene/furniture-model.ts`, `engine/scene/furniture-builder.ts`, `core/scene/plan-to-world.ts`, `core/scene/scene-graph.ts` (the furniture node), and the bridge code that adds the model group to the scene. Write a test that places an asymmetric model at a plan point away from the origin, turned by an angle that is not a multiple of 90 degrees, and compares the world bounds of the model group with the bounds of the box that `furniture-builder` makes for the same node. If the bounds differ, the test is the reproduction and a `fix/` pull request follows before pull request 7. If they agree, record why and close the question. Nobody files a defect before the test fails. Gates pull request 7.

  **Answer.** It reproduced. A loaded model was mirrored across plan y = 0 and turned the wrong way, because `furniture-model.ts` wrote plan y as world +Z and negated the rotation, while `planToWorld` maps plan y to world -Z. The fix is on `fix/loaded-model-follows-plan-axes`: a failing test, a fix that places the model through `planToWorld`, an empty refactor marker, and a note in ADR-0095. No screenshot baseline is expected to change. A defect issue is filed with that pull request, so pull request 7 no longer waits on a defect fix, only on refactor stage 6.

- [x] **Investigation B: the field table.** For each field of the specification's contract table, state its type, its limits, whether a reader that exists could misread a pack that carries it, and so whether `formatVersion` moves (ADR-0219). State whether the planned schema under `schema/pack-manifest/` allows unknown fields, and how an optional field is added to a published schema with no new format version. Read `core/assets/pack-manifest.ts`, ADR-0219, ADR-0229, and pull requests 1, 11, and 13 of the distribution plan. Gates pull request 3.

  **Answer.** No field of the contract table moves `formatVersion`. Every reader today picks the keys it knows, and only a new media type or a new `kind` is refused by an old reader. The shared validator checks the grammar of a category and the pack tool checks registry membership (builder decision 6). The manifest schemas are open and an optional field is added in place with the same `$id`. A pivot or a socket position needs a signed length rule, because `isPositiveLengthMm` refuses zero and negatives. `representations` stay reserved, because the pack tool reads a representation file as an orphan and publish leaves it out. Two checks that distribution pull request 1 does not hold moved here: see pull request 3.

- [x] **Investigation C: kinds and media types for domains with no reader.** For each of the eleven domains with no kind, and for `material` and `palette`, which validate as models today, propose the kind, the media type, and the reader that would use it, or say that the domain needs none because it feeds a registry. Read the specification's kind table, `core/assets/asset-description.ts`, and `core/registries/`. Gates no pull request here. It ends in issues.

  **Answer.** Every domain that feeds a registry needs a kind and a media type, because every pack entry is one file named by one hash, and only a binary glTF model or a texture validates today. The proposal: registry entries are JSON files of one kind each (`construction-profile`, `finish`, `palette`, `style`), the domains the engine draws get their own kinds (`glazing`, `drawing-symbol`, `light-emitter`, `environment-map`, `plant`, `arrangement`, `site-context`), and `BOT`, `RGH`, `VFX`, and `SYS` get no kind yet. Every new kind and media type would move `formatVersion` under today's rule, so the owner ruled that pack format 3 of the distribution plan (pull request 11) also says a reader skips an asset whose kind or media type it does not know. Later kinds and media types are then additive. Two code hazards are recorded in the issues: the split between model and texture media types is by prefix, so any `image/*` type reads as a texture, and the pack tool names an unknown media type's file `.glb`. Seventeen issues cover the proposed kinds. The skip-rule issue takes the milestone of distribution pull request 11, and the other sixteen go to `1.0`. The rule is also raised on #1054.

- [x] **Investigation D: from a layered assembly to a construction profile.** Map the wall subcategories of `LYR` to `ConstructionSystem`, say how a layer's material reference replaces the free string, give the registry id of a pack-supplied profile, and say what a wall shows when the pack is absent. Also give the shape of the suggested default finish for each face, and name the command path that applies an assembly to a wall and writes the finish into the paint map (an existing command, or a new one). Read ADR-0130, ADR-0137, ADR-0237, `core/registries/construction-profiles.ts`, and section 5.5 of the refactor round. Gates pull request 6.

  **Answer.** The owner ruled on 2026-11-23: all five new `ConstructionSystem` values now; a pack profile's id is its serialized asset reference; the apply command snapshots the total into `wall.thickness` and the inspector labels a missing profile; a suggested finish goes only into a face with no treatment; the interior side is derived at apply time. A new command applies an assembly in one undo step. The details are in the outline of pull request 6.

- [x] **Investigation E: the rounding of the derived geometry key.** Compare candidate rounding steps with the tolerances of ADR-0181 and ADR-0199, and say what step keeps two keys equal exactly when the kernel treats the two shapes as equal. Read ADR-0181, ADR-0199 (on the kernel records branch until it merges), and `core/units/`. Gates no pull request here. It ends in a comment on the specification's open point.

  **Answer.** The owner ruled on 2026-11-23: the key's contract is one-sided, on a grid of 1e-6 mm named `DERIVED_COORDINATE_GRID_MM`. Lengths are integer counts of that grid, rounded half away from zero, and angles are integer counts of 1e-9 degree. Two equal keys mean every parameter is less than one step apart, a thousandth of the length tolerance. A canonical value always keys equal, and a near miss across a grid boundary costs one rebuild and never a wrong shape. The geometry-changing manifest fields that ADR-0235 already puts in the key, such as the pivot, are rounded by the same rule. The ruled text replaces the open point in the specification and ADR-0235, both on this branch, and ADR-0235 also loses a wrong claim that ADR-0181 is not on `main`. The cache that uses the key waits for refactor stage 6.

- [x] **Investigation F: hosts and sockets.** Say how a socket predicate is checked when one placed element is put in another, using the host relation of refactor stage 5, and whether the hosting tree is stored on the child, as `hostWallId` is, or derived. Read section 5.5 of the refactor round, #679, and `core/model/types.ts`. Gates the deferred host work.

  **Answer.** The owner ruled on 2026-11-23. The link is stored on the child as one shape, the host's `{ kind, id }` and a socket name, and the tree of children by host is derived. Openings move to it in refactor stage 5, replacing `hostWallId` (schema version 18 and one mechanical migration). A child with no free-standing form, such as hardware or a receptacle, is a new hosted kind with a socket-relative pose, and the placing command copies the socket frame onto it. Furniture that rests on a host, such as a vase on a table, stays furniture with an optional link and keeps its world pose; the command that moves, turns, or raises the host carries it in the same undo step. Each socket in the host's manifest declares `type`, `mount` or `support`, with `mount` when absent: deleting a host removes its mounted children and detaches its supported ones to the floor, and a host whose socket type cannot be read detaches them too. A later override by the child's type is one optional field read by the one function that resolves the socket type, so it changes no stored file. Each command that makes or changes a link checks the socket predicate in its handler, and placing into a socket while a pack is absent is refused with a typed reason; loading never refuses and lists a link it cannot confirm. The predicate needs the registry inside command handlers, and socket positions wait on pull request 7. #679 is a closed selection defect that only proposes a uniform `{ kind, id }` reference.

- [x] **Investigation G: phase.** The owner ruled that phase is decided with the renovation comparison design of #494, not here, and stays out of the manifest. Compare one phase field on each element with two linked documents for that design. If a field wins, one enumeration covers its values. Gates the deferred phase work.

  **Answer.** One optional field wins over two linked documents: `phase?: 'existing' | 'removed' | 'new'` on each placed element, in one document, with an absent value meaning `existing`. A survey correction reaches the proposal at once, one undo history covers both states, and every consumer works unchanged on a filtered copy of the project. The owner ruled that phase is decided with the renovation comparison design, so the ruling goes to #494 as a recommendation and not into this plan's code. That comment also answers the save and first-version questions of #494, and it cites no file that is not on `main`. The phase stays out of the manifest, and the deferred phase work waits for #494.

- [x] **Investigation H: works in the public domain by age.** The owner ruled the policy: a first-party file made from such a work carries the first-party license of ADR-0229 (CC-BY-4.0), with the source in `sourceUrl` and a note in the pack's NOTICE, and a file redistributed unchanged is CC0-1.0 only when the source institution states CC0. Write that policy where pack authors read it, and check it against `core/assets/license-policy.ts` and ADR-0229. This is not legal advice. Gates no pull request here.

  **Answer.** The policy is written as the subsection "Works in the public domain by age" of `CONTRIBUTING.md`, under "Asset and registry contributions", the only document that addresses pack authors. It lands on this branch, as its own subsection beside the clause for contributed assets that the distribution plan adds, so the two merge as adjacent additions. Nothing in `core/assets/license-policy.ts` or ADR-0229 conflicts with it: `CC-BY-4.0` and `CC0-1.0` are both on the allowlist, and ADR-0229 already makes first-party files `CC-BY-4.0` and not dual licensed. Three gaps stay as written rules and not code. `sourceUrl` is optional in the tool, the pack tool checks that `NOTICE` exists and never reads it, and the allowlist has no identifier for a public-domain file without a CC0 statement, which is why the policy says not to redistribute such a file unchanged. A `1.0` issue makes publish require `sourceUrl`.

- [x] **Investigation I: does anything in the taxonomy need a change to the store before ADR-0229 merges?** Read ADR-0229, the distribution specification, ADR-0235, and ADR-0236. The expected answer is no. If the answer is yes, raise it on the distribution pull request before it merges.

  **Answer.** No change to the store before ADR-0229 merges. Two optional comments go on #1054 after 18:30: the published manifest schema should allow additional properties, and the file lists should walk every `{contentHash, byteLength}` pair an entry names. Three wording fixes landed on this branch: an identifier names one content hash and not one manifest entry; `lifecycle.status` of `withdrawn` never removes a blob; credits show `attribution`.

## Rules every pull request keeps

- A RED commit holds one failing test and the fixtures and fakes it needs. Its message is `test: ...`. GREEN is `feat: ...` or `fix: ...`. BLUE is `refactor: ...`, empty when the review finds nothing. Documents, build files, and end-to-end specs go in `docs:`, `build:`, and `test(e2e):` commits.
- RED proof: `pnpm exec vitest run <test file>` fails for the reason the cycle states. GREEN proof: the same command passes. Before a push: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` and `pnpm rgb:audit`.
- A RED brief that changes a public type also updates the fakes and fixtures that build it. New fields on shared types are optional.
- A script that plain `node` runs imports `core/` files through explicit `.ts` paths, so every new file under `core/assets/` and `core/registries/` that the validator reaches uses explicit `.ts` import paths too.
- Shared configuration (`package.json` scripts, `.prettierignore`, `.gitignore`, `vite.config.ts`, `eslint.config.js`) changes only where a file fence names it. No file fence in this plan names one.
- New decision records take the numbers assigned at dispatch and are checked against `origin/main` before landing. This plan holds ADR-0234 to ADR-0237, and ADR-0238 and ADR-0239 stay reserved for it.

## File Structure

| Area               | Files                                                                               | Responsibility                                                               |
| ------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `core/registries/` | `asset-domains.ts`                                                                  | The thirty domains with name, tier, and rank. The rank lookup.               |
| `core/registries/` | `asset-categories.ts`, `asset-categories-tier-1.ts` to `asset-categories-tier-4.ts` | The 410 categories and their display names.                                  |
| `core/assets/`     | `catalog-id.ts`                                                                     | The catalog identifier: type, parse, format.                                 |
| `core/assets/`     | `socket-predicate.ts`, `sub-resource.ts`                                            | Predicates over categories. The twelve sub-resource kinds and the text form. |
| `core/assets/`     | `taxonomy-fields.ts`, `reference-rank.ts`                                           | The checks for the classification fields. The rank rule.                     |
| `core/assets/`     | `pack-manifest.ts`, `pack-manifest-shape.ts`                                        | Call sites for the new checks. The typed read of the new fields.             |
| `tests/`           | `architecture/asset-taxonomy-inventory.test.ts`                                     | The registry and the specification list the same ids.                        |
| `tests/fixtures/`  | `packs/example-classified-1.0.0/`                                                   | A fixture pack that carries every checked field.                             |
| `editor/library/`  | `library-filter.ts`, `library-panel.tsx`, their tests and stories                   | The category filter and its chips.                                           |

## Pull request 1: the domain and category registries

Branch `feat/asset-domain-and-category-registries`. Depends on nothing else.

**Goal.** The taxonomy of the specification is data in `core/registries/`, and a test holds it equal to the inventory of the specification.

**What a user sees.** Nothing.

**File fence.**

- `core/registries/`: `asset-domains.ts`, `asset-categories.ts`, `asset-categories-tier-1.ts`, `asset-categories-tier-2.ts`, `asset-categories-tier-3.ts`, `asset-categories-tier-4.ts` (new), with `asset-domains.test.ts` and `asset-categories.test.ts`.
- `tests/architecture/asset-taxonomy-inventory.test.ts` (new).
- `core/index.ts` (exports only).
- `docs/knowledge/decisions/ADR-0006-registry-pattern.md` (the amendment under "Amendments to decision records").

**Interfaces.**

- Consumes: `createRegistry`, `getEntry`, `Registry`, `RegistryEntry`.
- Produces:
  - `asset-domains.ts`: `ASSET_DOMAIN_CODES` (a frozen tuple of the thirty codes in the order of the specification); `AssetDomainCode`; `AssetTier = 1 | 2 | 3 | 4`; `AssetDomain extends RegistryEntry { id: AssetDomainCode; name: string; tier: AssetTier; rank: number }`; `ASSET_DOMAIN_REGISTRY_VERSION = 1`; `builtinAssetDomains: Registry<AssetDomain>`; `isAssetDomainCode(value: string): value is AssetDomainCode`; `domainRank(code: AssetDomainCode): number`.
  - `asset-categories.ts`: `AssetCategory extends RegistryEntry { id: string; domain: AssetDomainCode; subcategory: string; name: string }`; `ASSET_CATEGORY_REGISTRY_VERSION = 1`; `builtinAssetCategories: Registry<AssetCategory>`; `categoriesOfDomain(code: AssetDomainCode): readonly AssetCategory[]`; `defaultCategoryName(subcategory: string): string`.
  - Each tier file: one constant that maps a domain code to its subcategory ids, in the order of the specification.

### Cycles

- [ ] **Cycle 1.** `core/registries/asset-domains.test.ts`: "lists thirty domains with the tier and rank of the specification". Assert thirty entries in `builtinAssetDomains`; `SUB` is tier 1 rank 10; `MAT` is tier 2 rank 20; `LYR` is tier 2 rank 25; `FFE` is tier 3 rank 30; `CTX`, `STY`, `SCT`, and `SYS` are tier 4 with ranks 40, 45, 48, and 48; the tiers hold 10, 5, 11, and 4 domains; the set of ranks is 10, 20, 25, 30, 40, 45, 48. Fails today: no such module. Implementation: `asset-domains.ts`.
- [ ] **Cycle 2.** "tells a domain code from other text and gives its rank". Assert `isAssetDomainCode('HDW')` is true, and false for `hdw`, `HD`, `HDWX`, and the empty string; `domainRank('MAT')` is 20; `ASSET_DOMAIN_CODES` starts with `SUB` and ends with `SYS`. Fails today: neither function exists. Implementation: the two functions.
- [ ] **Cycle 3.** `core/registries/asset-categories.test.ts`: "holds 410 categories with the count of each domain". Assert the total is 410 and the count for each domain: `SUB` 21, `COT` 14, `CLR` 10, `GLZ` 11, `PAT` 12, `RLF` 10, `WTH` 10, `LGT` 8, `VFX` 8, `SYM` 10, `MAT` 13, `PRF` 13, `KIT` 14, `BOT` 12, `LYR` 12, `STR` 14, `ENV` 15, `INT` 15, `HDW` 13, `MEP` 17, `NET` 11, `RGH` 15, `APP` 12, `FFE` 19, `SIT` 12, `LND` 15, `CTX` 15, `STY` 17, `SCT` 17, `SYS` 25. Assert every id matches `^[A-Z]{3}\.[a-z][a-z0-9_]{2,47}$`, and `getEntry(builtinAssetCategories, 'FFE.seating')` has domain `FFE` and subcategory `seating`. Fails today: no such module. Implementation: the four tier files and `asset-categories.ts`.
- [ ] **Cycle 4.** "gives each category a display name from its id unless one is written". Assert `defaultCategoryName('window_sash_casement')` is "Window sash casement"; `FFE.seating` is named "Seating"; `LGT.ies_distributions` is named "IES distributions" and `LGT.hdri_environment_maps` is named "HDRI environment maps"; no name is empty and none holds an underscore. Fails today: entries have no name. Implementation: `defaultCategoryName` and the table of written names.
- [ ] **Cycle 5.** `tests/architecture/asset-taxonomy-inventory.test.ts`: "the category registry and the inventory of the specification list the same ids in the same order". Setup: read `docs/specs/2026-11-23-asset-taxonomy.md`, take each heading of the form ``#### `CODE`: Name (count)`` under "Inventory" and the ids in backticks in the paragraph after it. Assert the list of `CODE.id` equals the ids of `builtinAssetCategories` in order, each heading's count equals the number of ids under it, and each heading's name equals the domain's `name`. Fails today: the test file does not exist, and written first it fails on the first domain whose name in the registry differs from the heading. Implementation: correct the registry until the two agree. The specification is the authority.
- [ ] **Cycle 6.** `core/registries/asset-categories.test.ts`: "lists the categories of one domain in the order of the specification". Assert `categoriesOfDomain('HDW')` has thirteen entries, all with domain `HDW`, and `categoriesOfDomain('LGT')` has eight. Fails today: no such function. Implementation: `categoriesOfDomain`.

**What it leaves.** Nothing reads the registries yet.

## Pull request 2: the catalog identifier, predicates, and sub-resources

Branch `feat/catalog-asset-identifier`. Depends on pull request 1.

**Goal.** The grammar of the specification parses and formats in `core/assets/`.

**What a user sees.** Nothing.

**File fence.**

- `core/assets/`: `catalog-id.ts`, `socket-predicate.ts`, `sub-resource.ts` (new, each with its test).
- `core/index.ts` (exports only).

**Interfaces.**

- Consumes: `ASSET_DOMAIN_CODES`, `AssetDomainCode`, `isAssetDomainCode`, and `parseAssetReference` (in a test only).
- Produces:
  - `catalog-id.ts`: `CatalogId { namespace: string; domain: AssetDomainCode; subcategory: string; slug: string; version: string }`; `CatalogIdParse = { ok: true; id: CatalogId } | { ok: false; problem: string }`; `parseCatalogId(text: string): CatalogIdParse`; `formatCatalogId(id: CatalogId): string`; `categoryOf(id: CatalogId): string`; `RESERVED_NAMESPACE_PREFIXES = ['mfr_']`.
  - `socket-predicate.ts`: `SocketPredicate { domain: AssetDomainCode; subcategory?: string; slug?: string }`; `parseSocketPredicate(text: string)` with the same result shape; `matchesPredicate(predicate: SocketPredicate, id: CatalogId): boolean`.
  - `sub-resource.ts`: `SUB_RESOURCE_KINDS` (the twelve kinds); `SubResourceKind`; `SubResource { kind: SubResourceKind; name: string }`; `SUB_RESOURCE_SEPARATOR = '~'`; `formatSubResource(id: CatalogId, part: SubResource): string`; `parseSubResourceText(text: string)` with the same result shape, giving `{ id, part }`; `isSubResourceName(name: string): boolean`.

### Cycles

- [ ] **Cycle 1.** `core/assets/catalog-id.test.ts`: "parses a catalog identifier into its five parts". Assert `core:FFE.seating/windsor_side_chair@1.0.0` gives namespace `core`, domain `FFE`, subcategory `seating`, slug `windsor_side_chair`, version `1.0.0`; `org_period-house:HDW.window_sash_casement/brass_sash_lock@2.1.0-rc.1` parses with version `2.1.0-rc.1`; `usr_dana` and `pkg_parlor-set` are accepted namespaces. Fails today: no such module. Implementation: `parseCatalogId` with the pattern of the specification.
- [ ] **Cycle 2.** "refuses text that breaks the grammar and names the part". One case each, with a problem text that names the part: domain `XYZ`; subcategory `ab`; slug `a`; slug `Windsor`; version `1.0`; version `01.0.0`; version `1.0.0+5`; version `1.0.0-01`; no namespace; namespace `org_` followed by 32 characters; namespace `Org_x`; a trailing space. Fails today: every text is accepted or the function is absent. Implementation: the checks by part.
- [ ] **Cycle 3.** "refuses the reserved namespace with its own message". Assert `mfr_example:HDW.door_locksets_latches/rim_lock@1.0.0` is refused and the problem says the namespace is reserved. Fails today: the text reads as a plain grammar error. Implementation: the reserved check before the pattern.
- [ ] **Cycle 4.** "formats an identifier to the text it was parsed from, and gives its category". Assert `formatCatalogId(parse(text).id)` equals `text` for the examples of cycle 1, and `categoryOf` gives `FFE.seating`. Fails today: neither function exists. Implementation: both.
- [ ] **Cycle 5.** "does not read the category registry". Assert `core:FFE.not_in_the_registry/thing@1.0.0` parses. Fails today only if cycle 1 was built with a registry lookup; the test fixes the boundary of builder decision 5. Write it as the RED of the next cycle's file if it passes at once, and note that in the commit.
- [ ] **Cycle 6.** `core/assets/socket-predicate.test.ts`: "a predicate matches a domain, a category, or one named asset in every version". Assert `HDW.*` matches any `HDW` identifier and no `FFE` one; `HDW.window_sash_casement/*` matches that category only; `HDW.window_sash_casement/brass_sash_lock` matches versions `1.0.0` and `2.0.0` of that slug in any namespace and no other slug. Assert a predicate over a tier 3 category parses, since a predicate is not a reference. Fails today: no such module. Implementation: `parseSocketPredicate` and `matchesPredicate`.
- [ ] **Cycle 7.** "refuses a malformed predicate". Refused: `HDW`, `hdw.*`, `HDW.*/*`, `HDW.window_sash_casement`, `HDW.window_sash_casement/brass_sash_lock@1.0.0`, and `XYZ.*`. Fails today: some are accepted. Implementation: the pattern of the specification.
- [ ] **Cycle 8.** `core/assets/sub-resource.test.ts`: "writes and reads the text form with a tilde". Assert `formatSubResource` of the door example and `{ kind: 'socket', name: 'strike_plate' }` ends with `@1.0.0~socket:strike_plate`; `parseSubResourceText` of that text gives the same identifier and part; `SUB_RESOURCE_KINDS` has twelve members; `isSubResourceName` accepts `lod0`, `plan_symbol`, and `ceiling_plan_symbol`, and refuses `0lod`, `a`, `Strike`, and a name of 49 characters; an unknown kind is refused. Fails today: no such module. Implementation: `sub-resource.ts`.
- [ ] **Cycle 9.** "a sub-resource text is never an asset reference". Assert the output of `formatSubResource` holds no number sign; `parseSubResourceText('pack:vernacular-starter@1.0.0#' + hash)` is refused; `parseSubResourceText(text + '#' + hash)` is refused; and for a valid sub-resource text, `parseAssetReference` either throws or gives a `contentHash` that is not 64 hex characters. Fails today: the second and third cases are not refused. Implementation: refuse any text that holds a number sign.

**What it leaves.** The validator does not call the grammar yet.

## Pull request 3: the classification fields in the manifest

Branch `feat/manifest-classification-fields`. Depends on pull request 2 and on pull request 1 of the distribution plan.

**Goal.** The pack validator checks `catalogId`, the grammar of taxonomy categories, `provenance`, and `lifecycle`, and a pack with none of them validates as before. The pack tool checks that a taxonomy category is in the registry. Two checks that distribution pull request 1 leaves open live here, because this is the first pull request of this plan that has the fields they read: the one-hash-per-identifier check at publish time and the first-party publish gate. Both need `catalogId` and the checked taxonomy fields, which exist only after this pull request, and both extend the publish step that distribution pull request 1 builds (`scripts/pack/publish-store.mjs`), which this pull request depends on. A pull request that comes later has no new field to add to them.

**What a user sees.** Nothing in the app. A pack author gets new checks from `pnpm pack:validate` and `pnpm pack:publish`.

**File fence.**

- `core/assets/`: `taxonomy-fields.ts` and its test (new), `pack-manifest.ts`, `pack-manifest.test.ts`, `pack-manifest-shape.ts`, `pack-manifest-shape.test.ts`.
- `tests/fixtures/packs/example-classified-1.0.0/` (new, written by the fixture script under `scripts/pack/`), and that script with its test.
- `scripts/pack/`: `vernacular-pack.mjs` (the registry check), `publish-taxonomy-checks.mjs` and its test (new), the call from `publish-store.mjs`, and `vernacular-pack.integration.test.mjs`.
- `core/assets/pack-manifest-file.ts` and the generated files under `schema/pack-manifest/`, if distribution pull request 13 has merged: this pull request adds the checked fields to their types and runs `pnpm schema:generate`. If it has not, pull request 13 reads the checked fields into its types, and this pull request does not touch them.
- The amendments to ADR-0219, ADR-0229, and ADR-0007 under "Amendments to decision records". ADR-0007 gets a pointer note only.

**Interfaces.**

- Consumes: `parseCatalogId`, `categoryOf`, `builtinAssetCategories`, `getEntry`, `comparePackVersions`, `ReadablePackAsset`, `readPackManifest`, `isRecord`, and from distribution pull request 1 `publishPack` and the reader of the manifests a store lists. The registry is read by the pack tool and by the check below, not by `validatePackManifest`.
- Produces:
  - `taxonomy-fields.ts`: `validateTaxonomyFields(source: Record<string, unknown>, label: string, errors: string[]): void`, the shape of `validateTextureFields`, which checks grammar only; `validateUniqueCatalogIds(assets: readonly unknown[], errors: string[]): void`; `unknownTaxonomyCategories(manifest: unknown, registry: Registry<AssetCategory>): string[]`, which the pack tool calls and which returns one labeled message for each taxonomy-form category the registry lacks; `LIFECYCLE_STATUSES = ['active', 'deprecated', 'withdrawn']`.
  - `scripts/pack/publish-taxonomy-checks.mjs`: `checkIdentifierHashes(incoming, stored): string[]` and `checkFirstPartyPack(manifest): string[]`. Names are proposals.
  - `pack-manifest-shape.ts`: `ReadablePackAsset` gains optional `catalogId?: string`, `provenance?: { author?: string; method?: string }`, and `lifecycle?: { status?: LifecycleStatus; replacedBy?: string }`.

### Cycles

- [ ] **Cycle 1.** `core/assets/taxonomy-fields.test.ts`: "accepts the example entry of the specification and refuses a malformed identifier". Setup: the example entry in a format 2 manifest, without `references`. Assert valid. Assert a manifest with none of the new fields and `categories: ['seating']` is valid, as a guard. Assert `catalogId: 'core:FFE.seating'` gives one error labeled `assets[0].catalogId` that carries the parser's problem text. Fails today: the malformed identifier is accepted. Implementation: `validateTaxonomyFields`, called from `validateAssetFields`.
- [ ] **Cycle 2.** "the category of the identifier must be in the entry's categories". Assert `catalogId` of `FFE.seating` with `categories: ['FFE.tables_desks']` gives one error labeled `assets[0].catalogId` that names `FFE.seating`. Fails today: accepted. Implementation: the comparison through `categoryOf`.
- [ ] **Cycle 3.** "a taxonomy category must have the grammar, a plain label stays valid, and a well formed category the registry lacks passes". Assert `categories: ['FFE.Bad Name']` and `categories: ['FFE.']` each give one error labeled `assets[0].categories`; `categories: ['seating', 'FFE.seating']` is valid; `categories: ['FFE.no_such_category']` is valid, because the shared validator does not read the registry; a category at pack level is checked the same way. Fails today: the malformed strings are accepted. Implementation: the grammar check of builder decision 6.
- [ ] **Cycle 4.** "accepts provenance with an author and a method and refuses other types". Assert `{ author: 'A. Maker', method: 'measured drawing' }` is valid; a number for either, an empty string for either, and a `provenance` that is not an object each give one labeled error; an unknown key inside is ignored. Fails today: every shape is accepted. Implementation: the provenance check.
- [ ] **Cycle 5.** "accepts a lifecycle and checks what replaces an asset". Assert `status` must be one of the three values. Assert `replacedBy` must parse, must be in the same domain as the entry's `catalogId`, must not equal it, and, when it names the same subcategory and slug, must have a higher version by `comparePackVersions`. Assert `replacedBy` on an entry with no `catalogId` is an error. Fails today: accepted. Implementation: the lifecycle check.
- [ ] **Cycle 6.** `core/assets/pack-manifest.test.ts`: "one catalog identifier appears once in a pack". Setup: two entries with the same `catalogId`. Assert one error that names both labels. Fails today: accepted. Implementation: `validateUniqueCatalogIds`, called from `validateAssets`.
- [ ] **Cycle 7.** "the fields are checked in a pack of any known format". Setup: a manifest with no `formatVersion` and a malformed `catalogId`. Assert the error of cycle 1. Fails today only if the call was placed inside the format 2 branch; if it passes at once, fold the assertion into cycle 1 and skip the cycle.
- [ ] **Cycle 8.** `core/assets/pack-manifest-shape.test.ts`: "reads the identifier, the provenance, and the lifecycle into the typed asset". Assert the example reads with its `catalogId` and `lifecycle.status` of `active`, and an entry with none of them reads with the fields absent. Fails today: the typed asset drops them. Implementation: the three optional fields.
- [ ] **Cycle 9.** `scripts/pack/vernacular-pack.integration.test.mjs`: "the classified example pack validates and builds, and the committed fixture is the script's output". Setup: `tests/fixtures/packs/example-classified-1.0.0/` with a chair entry that carries `catalogId`, `provenance`, and `lifecycle`. Assert `validate` and `build` exit with the valid code and the committed tree equals what the fixture script writes. Fails today: no such fixture. Implementation: the fixture and the script's new case.

- [ ] **Cycle 10.** `scripts/pack/vernacular-pack.integration.test.mjs`: "the pack tool refuses a taxonomy category the registry lacks, and the app validator accepts it". Setup: the classified example with `categories: ['FFE.no_such_category']`. Assert `validatePackManifest` returns valid, and `validate` prints one error that names the category and exits non-zero. Fails today: the tool does not read the registry. Implementation: `unknownTaxonomyCategories`, called from `vernacular-pack.mjs` after the shared validator.
- [ ] **Cycle 11.** `scripts/pack/publish-taxonomy-checks.test.mjs`: "publish refuses an identifier that the store already holds with another content hash". Setup: a store that lists `core:FFE.seating/windsor_side_chair@1.0.0` under one hash, read from the manifests under `manifests/sha256/` that the publish step already reads, and a pack that carries the same identifier with another hash. Assert one error that names the identifier and both hashes, and an untouched sink. The same identifier with the same hash in another pack publishes. Fails today: the publish step does not read `catalogId`. Implementation: `checkIdentifierHashes`, called from `publishPack`.
- [ ] **Cycle 12.** "publish holds a pack that carries a `core` identifier to the first-party gate". Assert an error for each of: a missing format field the distribution plan requires, an unchecked or malformed taxonomy field, and a `SUB` or `COT` entry with no `physical` key (presence only: the shape of `physical` stays reserved). A pack with no `core` identifier skips the gate. Fails today: nothing checks them. Implementation: `checkFirstPartyPack`, called from `publishPack`. ADR-0229 gets its amendment in this cycle's `docs:` commit.

**What it leaves.** No reader in the app uses the fields. The published schemas are open: an optional field is added in place with the same `$id` and no new format version. `representations` and every other contract stay reserved, so the pack tool still reads a representation file in `assets/` as an orphan, and publish leaves it out. The pull request that checks `representations` teaches the pack tool and the publish step where those files live.

## Pull request 4: the dependency rule

Branch `feat/manifest-dependency-rule`. Depends on pull request 3.

**Goal.** A manifest entry lists what it references, and the validator refuses a reference that does not point to a lower rank.

**What a user sees.** Nothing in the app. A pack author gets the rank check from `pnpm pack:validate`.

**File fence.**

- `core/assets/`: `reference-rank.ts` and its test (new), `taxonomy-fields.ts`, `taxonomy-fields.test.ts`, `pack-manifest-shape.ts`, `pack-manifest-shape.test.ts`.
- `tests/fixtures/packs/example-classified-1.0.0/` and the fixture script.
- `scripts/pack/vernacular-pack.integration.test.mjs`.

**Interfaces.**

- Consumes: `domainRank`, `AssetDomainCode`, `parseCatalogId`.
- Produces:
  - `reference-rank.ts`: `canReference(source: AssetDomainCode, target: AssetDomainCode): boolean`.
  - `taxonomy-fields.ts`: the `references` check inside `validateTaxonomyFields`.
  - `pack-manifest-shape.ts`: `ReadablePackAsset` gains optional `references?: readonly string[]`.

### Cycles

- [ ] **Cycle 1.** `core/assets/reference-rank.test.ts`: "a reference is allowed only to a lower rank". Allowed: `MAT` to `SUB`, `LYR` to `PRF`, `LYR` to `SUB`, `FFE` to `MAT`, `ENV` to `LYR`, `CTX` to `SIT`, `STY` to `CTX`, `SCT` to `STY`, `SYS` to `FFE`. Refused: `SUB` to `COT`, `MAT` to `PRF`, `MAT` to `MAT`, `LYR` to `STR`, `FFE` to `FFE`, `ENV` to `HDW`, `LGT` to `CTX`, `BOT` to `CTX`, `CTX` to `STY`, `SCT` to `SYS`. Fails today: no such module. Implementation: one comparison of two ranks.
- [ ] **Cycle 2.** `core/assets/taxonomy-fields.test.ts`: "refuses a reference that points up or sideways and names both domains". Setup: the chair of the specification with `references` to a `MAT` identifier (valid), then to an `HDW` identifier, then to a `CTX` identifier. Assert one error each for the last two, labeled `assets[0].references[0]`, that names `FFE` and the other domain. Fails today: accepted. Implementation: the check through `canReference`.
- [ ] **Cycle 3.** "references need an identifier, must parse, and name each asset once". One error each: `references` on an entry with no `catalogId`; a reference that does not parse; a reference equal to the entry's own `catalogId`; the same reference twice; a `references` that is not an array of strings. An empty array is valid. Fails today: accepted. Implementation: the shape checks.
- [ ] **Cycle 4.** `core/assets/pack-manifest-shape.test.ts` and `scripts/pack/vernacular-pack.integration.test.mjs`: "the typed asset carries its references, and the example pack's chair references the pack's material". Setup: the fixture pack gains a texture entry classified `SUB.hardwood_timber` and the chair references it. Assert the typed read gives the reference, and `validate` exits valid. Then, in memory, point the chair at an `FFE` identifier and assert `validate` prints the error of cycle 2 and exits non-zero. Fails today: the typed asset drops `references`, and the fixture has one entry. Implementation: the optional field and the fixture's second entry.

**What it leaves.** Whether a referenced asset exists in any pack is not checked.

## Pull request 5: the category filter in the library

Branch `feat/library-category-filter`. Depends on pull request 1 and on pull request 5 of the distribution plan, which rebuilds the panel.

**Goal.** The library offers a filter by category, with names from the category registry.

**What a user sees.** A row of category chips in the library when the visible items carry two or more categories. Choosing one keeps the items in it. With the one starter chair, nothing changes.

**File fence.**

- `editor/library/`: `library-filter.ts`, `library-filter.test.ts`, `library-panel.tsx`, `library-panel.test.tsx`, `library-panel-no-matches.test.tsx`, `library-panel.stories.tsx`, `library-panel.css`, `library-test-support.ts`.
- The amendment to ADR-0093 under "Amendments to decision records".

**Interfaces.**

- Consumes: `builtinAssetCategories`, `getEntry`, `AssetCategory`, `LibraryItem`, `LibraryFilters`, `DEFAULT_FILTERS`, `visibleLibraryItems`, `activeFilterLabels`.
- Produces: `LibraryFilters` gains `category: string | null`; `distinctCategories(items: LibraryItem[]): AssetCategory[]`; `nextCategory(active: string | null, clicked: string): string | null`.

### Cycles

- [ ] **Cycle 1.** `editor/library/library-filter.test.ts`: "offers the registry categories that the furniture carries, in registry order". Setup: items with `['FFE.seating']`, `['FFE.tables_desks', 'parlor']`, and `['seating']`. Assert `distinctCategories` gives the two registry entries in registry order, with their names, and nothing for the two plain labels. Fails today: no such function. Implementation: `distinctCategories`.
- [ ] **Cycle 2.** "a category filter keeps the items in it and combines with the other filters". Assert `visibleLibraryItems` with `category: 'FFE.seating'` keeps the first item only, with an era filter on top keeps what satisfies both, and with `category: null` is unchanged. Assert `nextCategory` clears an active chip that is clicked again. Fails today: `LibraryFilters` has no `category`. Implementation: the field, the match, and `nextCategory`. The RED brief updates `DEFAULT_FILTERS` and every fixture that builds a `LibraryFilters`.
- [ ] **Cycle 3.** "an active category is named in the list of active filters". Assert `activeFilterLabels` holds "Seating" when the category is active, in the position after the style. Fails today: the label is absent. Implementation: one more entry.
- [ ] **Cycle 4.** `editor/library/library-panel.test.tsx`: "the panel shows category chips for two or more categories and none for one". Assert chips with the two names render as toggle buttons with their pressed state, clicking one narrows the list, and a library whose items share one category renders no chip row. Fails today: no chips. Implementation: the chip row.
- [ ] **Cycle 5.** `editor/library/library-panel-no-matches.test.tsx`: "the no-matches text names the active category". Fails today: the text omits it. Implementation: follows from cycle 3 if the panel builds its text from `activeFilterLabels`; otherwise one line. A story with two categories is added in a `docs:` or `test:` commit, and its baseline is captured on CI.

**What it leaves.** The library still shows furniture only. Showing other kinds is the work of each kind's reader.

## Pull request 6: layered assemblies as construction profiles (waits)

Branch `feat/layered-assembly-profiles`. Waits on refactor stage 5 (registries resolved at run time). Investigation D is answered and the owner has ruled on it.

**Goal.** A pack can add a wall build-up to the construction profile registry, a layer names its material by a taxonomy reference, and applying an assembly copies its suggested default finish for each face into the paint map one time, into faces that have no finish yet.

**What a user sees.** Nothing until a control sets a wall's construction profile, which no control does today.

**Outline.** The cycles are written when the pull request is dispatched. They cover the following, each settled by a ruling of 2026-11-23 or by the code.

_Systems and layers._

- `ConstructionSystem` gains all five new values now: `timber-frame`, `plank-frame`, `mass-concrete`, `earthen`, and `log`. Nothing reads `system` and no saved file holds one, so the change is additive. A `LYR` entry declares its system, and the pack tool refuses a system its subcategory does not allow: `historic_masonry_walls` allows `solid-masonry` and `earthen`; `framed_exterior_walls` allows `platform-frame`, `balloon-frame`, `timber-frame`, `plank-frame`, and `log`; `interior_partition_walls` allows `platform-frame`, `balloon-frame`, `solid-masonry`, and `plank-frame`; `below_grade_foundations` allows `solid-masonry` and `mass-concrete`. `wet_fire_acoustic_strata` is a partial stack and has no system, and the other seven `LYR` subcategories wait for their own decisions.
- The layer's `material` stays a string. Its content is a `SUB` or `MAT` taxonomy name, category, or identifier, and an optional `framing` holds a `PRF` profile and a spacing in millimeters. The built-in profiles move to the same form, the exact slugs are the builder's choice, and `CONSTRUCTION_PROFILE_REGISTRY_VERSION` moves from 1 to 2. No project schema change, because a saved wall holds only the profile id.

_The id of a pack profile, and a missing pack._

- A pack profile's registry id is the serialized asset reference `pack:<packId>@<packVersion>#<sha256>`, made with `formatAssetReference` and resolved in the order of ADR-0007: the exact reference first, then the same hash in any other source. The registry refuses a pack entry whose id does not parse as a pack reference, so a pack can never shadow a built-in id. The `LYR` entry needs a kind and a media type, which investigation C proposes. The nine callers of `effectiveWallThickness` take the session's registry context.
- The apply command snapshots the profile total into `wall.thickness` in the same undo step, so a wall whose pack is absent keeps its true thickness and draws as a plain solid wall. The wall inspector labels a profile whose pack is absent as missing and names the reference.

_The suggested finish._

- The suggestion sits on the `LYR` entry, one optional value for each end of the stack, in the two kinds `core/model/paint.ts` holds (`solid` and `pattern`). A string in taxonomy form must be in `COT` for a finish and in `PAT` for a pattern, both below `LYR`. A pure function turns the suggestions into at most two paint-map entries. A finish that does not resolve falls back to `matte`.
- An apply writes a suggested finish only into a face that has no treatment. A face counts as treated when its whole-face key or any region key under it is present, and the handler checks `state.paint` when it runs, so a redo after other edits stays correct. Paint is part of the asset standard (`COT`, `CLR`, `PAT`, and `MAT` feed the paint map), not a separate feature.
- The interior side is derived at apply time and nothing is stored. A face is interior where a room lies on that side and exterior where none does, read with `wallStretches` (`core/scene/wall-room-sides.ts`). A partition gets the interior suggestion on both faces. A face whose runs are opposed gets one suggestion for each part through the `region` seam of `SurfaceRef` (ADR-0056). The first cycle of this part checks whether regions render. If they do not yet, the face takes the role of its longest part, and a later pull request replaces the fallback.

_The command._

- A new command `floor/apply-wall-assembly` with `{ floorId, wallId, profileId, thickness, finishes }`, registered with the wall commands (in a new handler file if `wall-commands.ts` would pass 300 lines). The creator in `session/` resolves the profile, refuses an unknown id, and computes `thickness` and `finishes`, so a redo replays the same values. The handler checks `thickness` with `assertPositiveLength`, sets `constructionProfile` and `thickness`, and then adds the finishes to `state.paint`. One `dispatch` is one undo step (red when undo leaves the finish or the thickness in place). With no finishes the paint map is untouched.
- Painting a face after an apply changes the paint map only, and replacing or changing the assembly later does not repaint a wall that already has its finish. The paint map holds no field that points back to the assembly, so `CURRENT_SCHEMA_VERSION` is unchanged.

`ADR-0137` is amended in this pull request. `ADR-0130` is not changed.

## Pull request 7: a declared pivot for models (waits)

Branch `feat/declared-model-pivot`. Waits on refactor stage 6 (the 3D scene view object), because two scene paths exist until then and both would need the change. The placement defect that investigation A found is fixed on `fix/loaded-model-follows-plan-axes`, which lands first.

**Goal.** An entry may declare its pivot, and the loader uses it. An entry that declares none is placed by the box fit, as today.

**What a user sees.** A model with a declared pivot sits on its pivot. Everything else is unchanged.

**Outline.** The cycles are written when the pull request is dispatched. They cover: the `placement.pivot` field as a point in millimeters in the model's frame, checked by the validator with a signed length rule (finite, absolute value at most `MAX_LENGTH_MM`) added beside `isPositiveLengthMm`, because a pivot is often zero or negative; the rule that a pack which declares a pivot stays correct when the pivot is ignored, or takes a format version; the pivot's path from the manifest to the scene node; `normalizeModelIntoBox` with and without a pivot; a stated convention for a model's front, which the fix leaves open (after it, local +X follows the footprint width direction, from the top-left corner to the top-right corner); and a `scene-webgl` test with an asymmetric model away from the origin. `ADR-0095` is amended in this pull request. The signed rule also serves the socket and volume contracts when they become checked.

## Amendments to decision records

No existing record is edited on the branch that carries this plan. Each amendment lands with the pull request named.

| Record   | Amendment                                                                                                                              | Lands with                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| ADR-0006 | The registry list gains the domain registry and the category registry.                                                                 | Pull request 1                                                                                                  |
| ADR-0007 | A pointer note only, saying that the catalog identifier is metadata and that the reference is unchanged. Its decision does not change. | Pull request 3                                                                                                  |
| ADR-0219 | The optional taxonomy fields, as an example of the rule that an optional field moves no format version.                                | Pull request 3                                                                                                  |
| ADR-0229 | The optional fields in the manifest example, and the check of one hash for one identifier at publish time.                             | Pull request 3                                                                                                  |
| ADR-0229 | A note that sharded blobs and file extensions were considered and not taken.                                                           | The distribution pull request (#1054), before it merges, or the first pull request that edits ADR-0229 after it |
| ADR-0093 | The category filter.                                                                                                                   | Pull request 5                                                                                                  |
| ADR-0137 | Pack-supplied profiles, and the layer's material as a taxonomy reference.                                                              | Pull request 6                                                                                                  |
| ADR-0095 | The declared pivot beside the box fit.                                                                                                 | Pull request 7                                                                                                  |
| ADR-0130 | None. ADR-0237 keeps it as it is.                                                                                                      | Not applicable                                                                                                  |
| ADR-0188 | None. ADR-0235 keeps the project id out of the document.                                                                               | Not applicable                                                                                                  |

The design specification is not edited by this plan. Two of its statements need an issue: section 4.4 lists the category registry as if it existed, and the statement that internal storage is in meters is out of date against ADR-0027.

## Deferred work and what it waits for

None of these has cycles here. Each gets an issue when the work starts. The one-hash-per-identifier check and the first-party publish gate are no longer deferred: they are cycles 11 and 12 of pull request 3.

| Work                                                                        | Waits for                                                             |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Sockets, the host relation, and the predicate check when placing            | Refactor stage 5 and investigation F                                  |
| `extensions` on furniture                                                   | Refactor stage 5 (common attributes)                                  |
| Instanced drawing and the derived geometry key                              | Refactor stage 6 and investigation E                                  |
| Plan symbols and ceiling plan symbols as representations                    | Refactor stage 7 (the plan drawing model)                             |
| The phase of a placed element                                               | The renovation comparison design (#494) and investigation G           |
| A void that goes part of the way into a wall                                | Wall modifiers (ADR-0034) after the kernel's wall path accessor       |
| Composed materials (`MAT` from a substrate, coatings, and weathering)       | The texture assets plan and a material resolver design                |
| Material slots on a model                                                   | The composed materials work                                           |
| Terrain data                                                                | A site design that adds it to `Site`, measured from the project datum |
| Further representations (`lod1`, `lod2`), as `representations` on the entry | The distribution plan, pull request 11 (decoders and pack format 3)   |
| Kinds and readers for the eleven domains with no reader                     | The issues of investigation C, then each reader                       |

## Order and parallel work

- **Investigations:** A, B, D, and I are answered. C, E, F, G, and H can start at any time.
- **Core lane, in order:** 1, 2, 3, 4. Pull request 1 starts at once. Pull request 3 needs pull request 1 of the distribution plan.
- **Editor lane:** 5 after 1 and after pull request 5 of the distribution plan.
- **Waiting:** 6 (refactor stage 5) and 7 (refactor stage 6).
- Merge order when all are ready: 1, 2, 3, 4, 5.

## Files shared with other efforts

- `core/assets/pack-manifest.ts`: edited by the texture assets plan, by pull requests 1 and 11 of the distribution plan, and by pull requests 3 and 4 here. Each adds one call to a validator in its own module, so a rebase touches one line.
- `core/assets/pack-manifest-shape.ts`: created by the distribution plan, pull request 1. Pull requests 3 and 4 here add optional fields.
- `editor/library/library-filter.ts` and `library-panel.tsx`: rebuilt by the distribution plan, pull request 5. Pull request 5 here lands after it.
- `core/index.ts`: exports only.
- The fixture script under `scripts/pack/` and `tests/fixtures/packs/`: the distribution plan adds `example-furniture-1.0.0`. This plan adds `example-classified-1.0.0` and edits no fixture of that plan.
- `schema/pack-manifest/` and `core/assets/pack-manifest-file.ts`: owned by the distribution plan, pull request 13. Pull request 3 here adds the checked fields to the types and regenerates the schemas only if pull request 13 has merged. Otherwise pull request 13 reads those fields into its types.
- `scripts/pack/publish-store.mjs`: created by the distribution plan, pull request 1. Pull request 3 here adds two calls to the checks of `publish-taxonomy-checks.mjs`.

## Size

| Pull request                             | Cycles |
| ---------------------------------------- | ------ |
| 1. Domain and category registries        | 6      |
| 2. Catalog identifier and sub-resources  | 9      |
| 3. Classification fields in the manifest | 12     |
| 4. Dependency rule                       | 4      |
| 5. Category filter in the library        | 5      |
| 6. Layered assemblies (waits)            | open   |
| 7. Declared pivot (waits)                | open   |
| Total with cycles                        | 36     |

## Issues to file when the work starts

Each goes to the `1.0` milestone unless the owner rules that it blocks the beta.

- One issue for each investigation, A to I.
- The skip rule of investigation C (a pack reader skips an asset whose kind or media type it does not know), in the milestone of distribution pull request 11, and one `1.0` issue for each of the other proposed kinds.
- Publish requires `sourceUrl` for a first-party file made from a work in the public domain (investigation H).
- The starter pack's next version writes `FFE.seating` and a period id that the period registry holds.
- Design specification section 4.4 and the stale statement about meters.
- Each row of "Deferred work and what it waits for" that has no issue yet.
- ADR-0229 gets a note that sharded blobs and file extensions were considered and not taken, if #1054 merges first.
- Display names of categories in other languages.
- The pack-validator agent's checklist gains the taxonomy checks (#1104 covers the earlier update).

## Risks

- **The records depend on unmerged records.** If ADR-0229 or ADR-0230 changes in #1054, or the branch that carries ADR-0181, ADR-0199, and ADR-0201 to ADR-0203 changes, the pull requests that build on them change with them. Pull requests 3, 4, and 6 are the likely ones.
- **A suggested finish can drift from its assembly.** The finish is copied once, so a later edit to the assembly does not repaint a wall. That is the ruled behavior, and cycle tests hold it.
- **Two plans edit the validator.** Pull request 3 lands after pull request 1 of the distribution plan. If that plan slips, pull request 3 can land first with a local version comparison and a local typed read, and the later rebase removes them.
- **The inventory is long.** 410 ids typed by hand will hold an error. Cycle 5 of pull request 1 compares the registry with the specification id by id, and the specification's list was checked by script against its source.
- **A registry of 410 entries with one chair in the library.** The registry is data and takes a few kilobytes. The chip row shows only what items carry, so an empty category never appears.
- **Reserved fields may be used early.** A pack that fills in a reserved contract validates, because unknown fields are ignored. Its shape may change. The specification says so, and the pack tool could warn. That warning is not in this plan.
- **The model placement fix.** Investigation A reproduced the defect, and its fix changes where every loaded model appears. The starter chair's file is a 41-byte placeholder (`public/packs/vernacular-starter-1.0.0/assets/`), so the app has shown the box so far, which explains why nobody saw it. The fix lands on its own pull request before pull request 7.
- **ADR numbers.** ADR-0234 to ADR-0239 are reserved for this effort. Check `origin/main` before landing.

## Execution

Run this plan with superpowers:subagent-driven-development from the main thread: one `test-author`, one `implementer`, and one `refactorer` dispatch for each cycle, the clean-code review before each BLUE commit, and the pull request review before each landing. A background agent cannot dispatch those roles, so the main thread orchestrates each cycle. The investigations are single read-only dispatches and can run in the background.
