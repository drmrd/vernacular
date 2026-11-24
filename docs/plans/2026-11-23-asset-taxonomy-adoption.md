# Asset Taxonomy Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repository a task is one red-green-blue cycle: the `test-author` role commits one failing test, the `implementer` role commits the minimal code, and the `refactorer` role commits a refactor or an empty marker after the clean-code review.

**Goal:** The asset taxonomy exists in `core/` as data and as checks: two registries hold the thirty domains and the 410 categories, a catalog identifier and a sub-resource parse and format, the pack validator checks the classification fields and the dependency rule, and the library can filter by category. Everything that needs a new reader in the app is ordered behind the investigation or the other effort it waits for.

**Architecture:** Pure data and pure functions in `core/registries/` and `core/assets/`. The pack tool reaches them through `validatePackManifest`, as it does today. The editor reads the category registry for the library filter. No project schema changes, no command, no new layer, and no new package.

**Tech Stack:** TypeScript, Vitest, React for the one editor pull request. No new package.

**Spec:** `docs/specs/2026-11-23-asset-taxonomy.md`. Decision records: ADR-0234, ADR-0235, ADR-0236, and ADR-0237, all current. The owner ruled on their decisions on 2026-11-23. Related work: `docs/plans/2026-11-22-asset-pack-distribution.md` (the distribution plan), `docs/specs/2026-11-14-architecture-refactor-round.md` (the refactor round), and `docs/plans/2026-11-19-texture-assets-in-packs.md`.

- Base: branch `docs/asset-taxonomy` at `7026280d`. Paths and signatures were read there.
- The four decision records are current, and the owner has ruled on every decision in them. "What each pull request still waits for" names the investigation or the other effort that each pull request waits on.
- The distribution plan and ADR-0229 are not merged at this base. ADR-0229 and ADR-0230 are in an open pull request (#1054), and ADR-0181, ADR-0199, and ADR-0201 to ADR-0203 are on a branch that has not merged. The records here depend on them. Where this plan consumes a name from the distribution plan, the pull request says so and lands after it.

## Global Constraints

- Layer rules of `.claude/rules.md` hold. Everything in pull requests 1 to 4 is in `core/` and imports no React, no Three.js, and no DOM global.
- Every asset reference stays `(scope, contentHash)` (ADR-0007). No pull request stores a catalog identifier in a project, resolves bytes by one, or keys a cache by one (ADR-0235).
- No project schema change. `CURRENT_SCHEMA_VERSION` stays 17 and `CURRENT_SCHEMA_REVISION` stays where the base has it. If a cycle seems to need a change to `core/model/types.ts`, stop and ask.
- `formatVersion` does not move in this plan. Every new manifest field is optional, and a pack with none of them validates exactly as before (ADR-0219, ADR-0236).
- Lengths in a manifest are millimeters and are checked with `isPositiveLengthMm` from `core/assets/manifest-lengths.ts`. Angles are degrees.
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
- `normalizeModelIntoBox(model, node)` (`engine/scene/furniture-model.ts`) places a model at `(footprintCenter.x, node.elevationZ, footprintCenter.y)` and turns it by `-rotationRadians`. The furniture box (`engine/scene/furniture-builder.ts`) goes through `planToWorld`, which maps plan y to world -Z (`core/scene/plan-to-world.ts`). Investigation A checks whether the two agree.
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
5. **The grammar does not read the registry.** `parseCatalogId` checks the pattern and the domain code. The manifest validator checks that the category exists.
6. **Taxonomy form in `categories`.** A category string that starts with three capital letters and a full stop is taken as a taxonomy category and must be in the registry. Any other string is a plain label and stays valid.
7. **Unknown keys.** A key the validator does not know stays ignored, inside `provenance` and `lifecycle` as elsewhere.
8. **Which formats.** The new fields are checked whenever they are present, in a pack of any known format.
9. **References are checked from their text.** The rank rule needs only the two domain codes, so a reference to an asset of another pack is checked the same way. Whether the named asset exists anywhere is not checked until the catalog work provides a way.
10. **Chips.** The library shows a row of category chips when its visible items carry two or more registry categories. A plain label gets no chip.
11. **No alias table.** The starter pack's `seating` stays a plain label until the next version of that pack is built, which then writes `FFE.seating`. An issue tracks it.

## What each pull request still waits for

Every decision the pull requests build is ruled. Each pull request below waits only on the work named in its row.

| Pull request                    | Record it builds   | What it still waits for                                                                                                     |
| ------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 1. Domain and category registry | ADR-0234           | Nothing. All 410 categories enter the registry at once.                                                                     |
| 2. Catalog identifier           | ADR-0235           | Nothing. An asset keeps its own version, the separator is a tilde, and `mfr_` is reserved and refused.                      |
| 3. Classification fields        | ADR-0235, ADR-0236 | Investigation B, and pull request 1 of the distribution plan.                                                               |
| 4. Dependency rule              | ADR-0234           | Pull request 3.                                                                                                             |
| 5. Library category filter      | ADR-0234           | Pull request 1, and pull request 5 of the distribution plan.                                                                |
| 6. Layered assemblies           | ADR-0237           | Investigation D, and refactor stage 5. The suggested default finish is ruled, and its cycles are part of this pull request. |
| 7. Declared pivot               | ADR-0236           | Investigation A, and refactor stage 6.                                                                                      |

Rulings that need no pull request: element ids keep their form, the project id stays out of the document, the store layout of ADR-0229 stays flat with no extension, and a manifest length is in millimeters.

## Investigations before code

Each is one agent's task and ends in a written answer on the issue that tracks it. None commits code, except that investigation A commits its failing test if it reproduces.

- [ ] **Investigation A: does a loaded model land where its box lands?** Read `engine/scene/furniture-model.ts`, `engine/scene/furniture-builder.ts`, `core/scene/plan-to-world.ts`, `core/scene/scene-graph.ts` (the furniture node), and the bridge code that adds the model group to the scene. Write a test that places an asymmetric model at a plan point away from the origin, turned by an angle that is not a multiple of 90 degrees, and compares the world bounds of the model group with the bounds of the box that `furniture-builder` makes for the same node. If the bounds differ, the test is the reproduction and a `fix/` pull request follows before pull request 7. If they agree, record why and close the question. Nobody files a defect before the test fails. Gates pull request 7.
- [ ] **Investigation B: the field table.** For each field of the specification's contract table, state its type, its limits, whether a reader that exists could misread a pack that carries it, and so whether `formatVersion` moves (ADR-0219). State whether the planned schema under `schema/pack-manifest/` allows unknown fields, and how an optional field is added to a published schema with no new format version. Read `core/assets/pack-manifest.ts`, ADR-0219, ADR-0229, and pull requests 1, 11, and 13 of the distribution plan. Gates pull request 3.
- [ ] **Investigation C: kinds and media types for domains with no reader.** For each of the eleven domains with no kind, and for `material` and `palette`, which validate as models today, propose the kind, the media type, and the reader that would use it, or say that the domain needs none because it feeds a registry. Read the specification's kind table, `core/assets/asset-description.ts`, and `core/registries/`. Gates no pull request here. It ends in issues.
- [ ] **Investigation D: from a layered assembly to a construction profile.** Map the wall subcategories of `LYR` to `ConstructionSystem`, say how a layer's material reference replaces the free string, give the registry id of a pack-supplied profile, and say what a wall shows when the pack is absent. Also give the shape of the suggested default finish for each face, and name the command path that applies an assembly to a wall and writes the finish into the paint map (an existing command, or a new one). Read ADR-0130, ADR-0137, ADR-0237, `core/registries/construction-profiles.ts`, and section 5.5 of the refactor round. Gates pull request 6.
- [ ] **Investigation E: the rounding of the derived geometry key.** Compare candidate rounding steps with the tolerances of ADR-0181 and ADR-0199, and say what step keeps two keys equal exactly when the kernel treats the two shapes as equal. Read ADR-0181, ADR-0199 (on the kernel records branch until it merges), and `core/units/`. Gates no pull request here. It ends in a comment on the specification's open point.
- [ ] **Investigation F: hosts and sockets.** Say how a socket predicate is checked when one placed element is put in another, using the host relation of refactor stage 5, and whether the hosting tree is stored on the child, as `hostWallId` is, or derived. Read section 5.5 of the refactor round, #679, and `core/model/types.ts`. Gates the deferred host work.
- [ ] **Investigation G: phase.** The owner ruled that phase is decided with the renovation comparison design of #494, not here, and stays out of the manifest. Compare one phase field on each element with two linked documents for that design. If a field wins, one enumeration covers its values. Gates the deferred phase work.
- [ ] **Investigation H: works in the public domain by age.** The owner ruled the policy: a first-party file made from such a work carries the first-party license of ADR-0229 (CC-BY-4.0), with the source in `sourceUrl` and a note in the pack's NOTICE, and a file redistributed unchanged is CC0-1.0 only when the source institution states CC0. Write that policy where pack authors read it, and check it against `core/assets/license-policy.ts` and ADR-0229. This is not legal advice. Gates no pull request here.
- [ ] **Investigation I: does anything in the taxonomy need a change to the store before ADR-0229 merges?** Read ADR-0229, the distribution specification, ADR-0235, and ADR-0236. The expected answer is no. If the answer is yes, raise it on the distribution pull request before it merges.

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

Branch `feat/manifest-classification-fields`. Depends on pull request 2, on investigation B, and on pull request 1 of the distribution plan.

**Goal.** The pack validator checks `catalogId`, the taxonomy categories, `provenance`, and `lifecycle`, and a pack with none of them validates as before.

**What a user sees.** Nothing in the app. A pack author gets new checks from `pnpm pack:validate`.

**File fence.**

- `core/assets/`: `taxonomy-fields.ts` and its test (new), `pack-manifest.ts`, `pack-manifest.test.ts`, `pack-manifest-shape.ts`, `pack-manifest-shape.test.ts`.
- `tests/fixtures/packs/example-classified-1.0.0/` (new, written by the fixture script under `scripts/pack/`), and that script with its test.
- `scripts/pack/vernacular-pack.integration.test.mjs`.
- The amendments to ADR-0219 and ADR-0007 under "Amendments to decision records". ADR-0007 gets a pointer note only.

**Interfaces.**

- Consumes: `parseCatalogId`, `categoryOf`, `builtinAssetCategories`, `getEntry`, `comparePackVersions`, `ReadablePackAsset`, `readPackManifest`, `isRecord`.
- Produces:
  - `taxonomy-fields.ts`: `validateTaxonomyFields(source: Record<string, unknown>, label: string, errors: string[]): void`, the shape of `validateTextureFields`; `validateUniqueCatalogIds(assets: readonly unknown[], errors: string[]): void`; `LIFECYCLE_STATUSES = ['active', 'deprecated', 'withdrawn']`.
  - `pack-manifest-shape.ts`: `ReadablePackAsset` gains optional `catalogId?: string`, `provenance?: { author?: string; method?: string }`, and `lifecycle?: { status?: LifecycleStatus; replacedBy?: string }`.

### Cycles

- [ ] **Cycle 1.** `core/assets/taxonomy-fields.test.ts`: "accepts the example entry of the specification and refuses a malformed identifier". Setup: the example entry in a format 2 manifest, without `references`. Assert valid. Assert a manifest with none of the new fields and `categories: ['seating']` is valid, as a guard. Assert `catalogId: 'core:FFE.seating'` gives one error labeled `assets[0].catalogId` that carries the parser's problem text. Fails today: the malformed identifier is accepted. Implementation: `validateTaxonomyFields`, called from `validateAssetFields`.
- [ ] **Cycle 2.** "the category of the identifier must be in the entry's categories". Assert `catalogId` of `FFE.seating` with `categories: ['FFE.tables_desks']` gives one error labeled `assets[0].catalogId` that names `FFE.seating`. Fails today: accepted. Implementation: the comparison through `categoryOf`.
- [ ] **Cycle 3.** "a taxonomy category must be in the registry, and a plain label stays valid". Assert `categories: ['FFE.no_such_category']` gives one error labeled `assets[0].categories`; `categories: ['seating', 'FFE.seating']` is valid; a category at pack level is checked the same way. Fails today: accepted. Implementation: builder decision 6.
- [ ] **Cycle 4.** "accepts provenance with an author and a method and refuses other types". Assert `{ author: 'A. Maker', method: 'measured drawing' }` is valid; a number for either, an empty string for either, and a `provenance` that is not an object each give one labeled error; an unknown key inside is ignored. Fails today: every shape is accepted. Implementation: the provenance check.
- [ ] **Cycle 5.** "accepts a lifecycle and checks what replaces an asset". Assert `status` must be one of the three values. Assert `replacedBy` must parse, must be in the same domain as the entry's `catalogId`, must not equal it, and, when it names the same subcategory and slug, must have a higher version by `comparePackVersions`. Assert `replacedBy` on an entry with no `catalogId` is an error. Fails today: accepted. Implementation: the lifecycle check.
- [ ] **Cycle 6.** `core/assets/pack-manifest.test.ts`: "one catalog identifier appears once in a pack". Setup: two entries with the same `catalogId`. Assert one error that names both labels. Fails today: accepted. Implementation: `validateUniqueCatalogIds`, called from `validateAssets`.
- [ ] **Cycle 7.** "the fields are checked in a pack of any known format". Setup: a manifest with no `formatVersion` and a malformed `catalogId`. Assert the error of cycle 1. Fails today only if the call was placed inside the format 2 branch; if it passes at once, fold the assertion into cycle 1 and skip the cycle.
- [ ] **Cycle 8.** `core/assets/pack-manifest-shape.test.ts`: "reads the identifier, the provenance, and the lifecycle into the typed asset". Assert the example reads with its `catalogId` and `lifecycle.status` of `active`, and an entry with none of them reads with the fields absent. Fails today: the typed asset drops them. Implementation: the three optional fields.
- [ ] **Cycle 9.** `scripts/pack/vernacular-pack.integration.test.mjs`: "the classified example pack validates and builds, and the committed fixture is the script's output". Setup: `tests/fixtures/packs/example-classified-1.0.0/` with a chair entry that carries `catalogId`, `provenance`, and `lifecycle`. Assert `validate` and `build` exit with the valid code and the committed tree equals what the fixture script writes. Fails today: no such fixture. Implementation: the fixture and the script's new case.

**What it leaves.** No reader in the app uses the fields. The published schema gains them as investigation B rules.

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

Branch `feat/layered-assembly-profiles`. Waits on investigation D and on refactor stage 5 (registries resolved at run time).

**Goal.** A pack can add a wall build-up to the construction profile registry, a layer names its material by a taxonomy reference, and applying an assembly copies its suggested default finish for each face into the paint map one time.

**What a user sees.** Nothing until a control sets a wall's construction profile, which no control does today.

**Outline.** The cycles are written when investigation D ends. They cover:

- the layer's material as a `SUB` or `MAT` category or identifier, with the built-in profiles moved to the same form;
- the `LYR` entry's shape in the manifest;
- the merge of pack-supplied profiles into the registry context of the session;
- the fallback for a wall whose profile is absent;
- the suggested default finish: the manifest check of a suggestion for each of the two faces, which must be a surface treatment of the kind `core/model/paint.ts` holds and may reference only lower-rank assets;
- a pure function that turns an assembly's suggestions into the paint-map entries for one wall's two faces (red when the interior face gets the exterior suggestion, or a face with no suggestion is written);
- the command that applies an assembly to a wall: one `dispatch` that sets the profile and writes each suggested finish, so one undo reverses both (red when undo leaves the finish in place);
- an assembly with no suggestion leaves the paint map unchanged;
- painting a face after the apply changes the paint map only, and replacing or changing the assembly later does not repaint a wall that already has its finish;
- the paint map holds no field that points back to the assembly, so `CURRENT_SCHEMA_VERSION` is unchanged.

`ADR-0137` is amended in this pull request. `ADR-0130` is not changed.

## Pull request 7: a declared pivot for models (waits)

Branch `feat/declared-model-pivot`. Waits on investigation A, on the `fix/` pull request that may follow it, and on refactor stage 6 (the 3D scene view object), because two scene paths exist until then and both would need the change.

**Goal.** An entry may declare its pivot, and the loader uses it. An entry that declares none is placed by the box fit, as today.

**What a user sees.** A model with a declared pivot sits on its pivot. Everything else is unchanged.

**Outline.** The cycles are written when investigation A ends. They cover: the `placement.pivot` field as a point in millimeters in the model's frame, checked by the validator; the pivot's path from the manifest to the scene node; `normalizeModelIntoBox` with and without a pivot; and a `scene-webgl` test with an asymmetric model away from the origin. `ADR-0095` is amended in this pull request.

## Amendments to decision records

No existing record is edited on the branch that carries this plan. Each amendment lands with the pull request named.

| Record   | Amendment                                                                                                                              | Lands with                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| ADR-0006 | The registry list gains the domain registry and the category registry.                                                                 | Pull request 1                                                                                                  |
| ADR-0007 | A pointer note only, saying that the catalog identifier is metadata and that the reference is unchanged. Its decision does not change. | Pull request 3                                                                                                  |
| ADR-0219 | The optional taxonomy fields, as an example of the rule that an optional field moves no format version.                                | Pull request 3                                                                                                  |
| ADR-0229 | The optional fields in the manifest example, and the check of one hash for one identifier at publish time.                             | The pull request that adds that check                                                                           |
| ADR-0229 | A note that sharded blobs and file extensions were considered and not taken.                                                           | The distribution pull request (#1054), before it merges, or the first pull request that edits ADR-0229 after it |
| ADR-0093 | The category filter.                                                                                                                   | Pull request 5                                                                                                  |
| ADR-0137 | Pack-supplied profiles, and the layer's material as a taxonomy reference.                                                              | Pull request 6                                                                                                  |
| ADR-0095 | The declared pivot beside the box fit.                                                                                                 | Pull request 7                                                                                                  |
| ADR-0130 | None. ADR-0237 keeps it as it is.                                                                                                      | Not applicable                                                                                                  |
| ADR-0188 | None. ADR-0235 keeps the project id out of the document.                                                                               | Not applicable                                                                                                  |

The design specification is not edited by this plan. Two of its statements need an issue: section 4.4 lists the category registry as if it existed, and the statement that internal storage is in meters is out of date against ADR-0027.

## Deferred work and what it waits for

None of these has cycles here. Each gets an issue when the work starts.

| Work                                                                                                                                           | Waits for                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| The check of one hash for one identifier across a store                                                                                        | The distribution plan, pull request 1 (the publish step)              |
| Sockets, the host relation, and the predicate check when placing                                                                               | Refactor stage 5 and investigation F                                  |
| `extensions` on furniture                                                                                                                      | Refactor stage 5 (common attributes)                                  |
| Instanced drawing and the derived geometry key                                                                                                 | Refactor stage 6 and investigation E                                  |
| Plan symbols and ceiling plan symbols as representations                                                                                       | Refactor stage 7 (the plan drawing model)                             |
| The phase of a placed element                                                                                                                  | The renovation comparison design (#494) and investigation G           |
| The first-party publish gate: required format fields, the checked taxonomy fields, and baseline properties on `SUB` and `COT` as reserved data | The distribution plan, pull request 1 (the publish step)              |
| A void that goes part of the way into a wall                                                                                                   | Wall modifiers (ADR-0034) after the kernel's wall path accessor       |
| Composed materials (`MAT` from a substrate, coatings, and weathering)                                                                          | The texture assets plan and a material resolver design                |
| Material slots on a model                                                                                                                      | The composed materials work                                           |
| Terrain data                                                                                                                                   | A site design that adds it to `Site`, measured from the project datum |
| Further representations (`lod1`, `lod2`), as `representations` on the entry                                                                    | The distribution plan, pull request 11 (decoders and pack format 3)   |
| Kinds and readers for the eleven domains with no reader                                                                                        | Investigation C, then one issue for each domain                       |

## Order and parallel work

- **Investigations:** A, B, D, and I start at once and run side by side. C, E, F, G, and H can start at any time.
- **Core lane, in order:** 1, 2, 3, 4. Pull request 1 starts at once. Pull request 3 needs investigation B and pull request 1 of the distribution plan.
- **Editor lane:** 5 after 1 and after pull request 5 of the distribution plan.
- **Waiting:** 6 and 7.
- Merge order when all are ready: 1, 2, 3, 4, 5.

## Files shared with other efforts

- `core/assets/pack-manifest.ts`: edited by the texture assets plan, by pull requests 1 and 11 of the distribution plan, and by pull requests 3 and 4 here. Each adds one call to a validator in its own module, so a rebase touches one line.
- `core/assets/pack-manifest-shape.ts`: created by the distribution plan, pull request 1. Pull requests 3 and 4 here add optional fields.
- `editor/library/library-filter.ts` and `library-panel.tsx`: rebuilt by the distribution plan, pull request 5. Pull request 5 here lands after it.
- `core/index.ts`: exports only.
- The fixture script under `scripts/pack/` and `tests/fixtures/packs/`: the distribution plan adds `example-furniture-1.0.0`. This plan adds `example-classified-1.0.0` and edits no fixture of that plan.
- `schema/pack-manifest/`: owned by the distribution plan, pull request 13. This plan edits it only as investigation B rules.

## Size

| Pull request                             | Cycles |
| ---------------------------------------- | ------ |
| 1. Domain and category registries        | 6      |
| 2. Catalog identifier and sub-resources  | 9      |
| 3. Classification fields in the manifest | 9      |
| 4. Dependency rule                       | 4      |
| 5. Category filter in the library        | 5      |
| 6. Layered assemblies (waits)            | open   |
| 7. Declared pivot (waits)                | open   |
| Total with cycles                        | 33     |

## Issues to file when the work starts

Each goes to the `1.0` milestone unless the owner rules that it blocks the beta.

- One issue for each investigation, A to I.
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
- **The model placement question.** If investigation A reproduces a defect, the fix changes where every loaded model appears. The starter chair's file is a 41-byte placeholder (`public/packs/vernacular-starter-1.0.0/assets/`), so the app has shown the box so far, which would explain why nobody has seen it.
- **ADR numbers.** ADR-0234 to ADR-0239 are reserved for this effort. Check `origin/main` before landing.

## Execution

Run this plan with superpowers:subagent-driven-development from the main thread: one `test-author`, one `implementer`, and one `refactorer` dispatch for each cycle, the clean-code review before each BLUE commit, and the pull request review before each landing. A background agent cannot dispatch those roles, so the main thread orchestrates each cycle. The investigations are single read-only dispatches and can run in the background.
