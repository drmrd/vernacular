---
slug: decisions/ADR-0234-assets-are-classified-by-domain-and-tier-and-references-point-down
title: 'ADR-0234: Assets are classified by domain and tier, and references point only to lower ranks'
type: decision
tags: [architecture, assets, packs, taxonomy, registries, validation, library]
related:
  [
    decisions/ADR-0006-registry-pattern,
    decisions/ADR-0007-content-addressed-assets,
    decisions/ADR-0024-pack-manifest-validation-location,
    decisions/ADR-0091-pack-integrity-and-build-pipeline,
    decisions/ADR-0093-in-app-asset-library,
    decisions/ADR-0219-pack-assets-carry-textures,
    decisions/ADR-0229-one-library-over-a-shared-hash-addressed-asset-store,
    decisions/ADR-0235-a-catalog-identifier-names-an-asset-beside-its-content-hash,
    decisions/ADR-0236-asset-contracts-are-optional-manifest-fields-in-millimeters,
  ]
sourceFiles:
  [
    docs/specs/2026-11-23-asset-taxonomy.md,
    docs/specs/2026-06-01-vernacular-design.md,
    core/assets/pack-manifest.ts,
    core/registries/registry.ts,
    editor/library/library-filter.ts,
  ]
status: current
updated: 2026-11-23
---

# ADR-0234: Assets are classified by domain and tier, and references point only to lower ranks

## Status

Current, 2026-11-23. Nothing is built yet. The inventory and the grammar are in
`docs/specs/2026-11-23-asset-taxonomy.md`, and the work is ordered in
`docs/plans/2026-11-23-asset-taxonomy-adoption.md`. On 2026-11-23 the owner ruled that `kind` and
the domain both stay, and that all 410 categories enter the registry at once.

This record depends on ADR-0229, which is in an open pull request (#1054) and not yet on `main`.
The decisions here that build on it take effect when it lands.

## Context

A pack asset has one of nine kinds and a list of category strings (`core/assets/pack-manifest.ts`).
The validator requires the list to be non-empty and checks nothing else about it. No registry gives
a category a name, a parent, or a meaning, although the design specification names a hierarchical
category registry in section 4.4. The library shows furniture only and filters by name, source, era,
and style (`editor/library/library-filter.ts`).

The library on `main` holds one chair, so none of this has mattered. The project means to carry far
more than furniture: wall assemblies, windows and doors, trim profiles, hardware, fixtures, plants,
plan symbols, and the materials all of them are made of. Packs will come from more than one author.
Two things are missing for that.

The first is a shared vocabulary. Two authors who both publish a sash lock need the same word for
it, or the library cannot group their work and a window cannot say that it accepts one.

The second is a rule for dependencies. Assets will name each other: a material names its substrate,
and a door names the profile of its casing. With no rule, a chain of such names can loop, and a tool
can only find the loop by reading every pack in the catalog. A pack that someone imports on their
own could not be checked at all.

## Decision

### Thirty domains in four tiers

Every asset belongs to one domain and one subcategory inside it. There are thirty domains, each with
a three-letter code, and 410 subcategories. A category is written `<DOMAIN>.<subcategory>`, for
example `FFE.seating`, where `FFE` is the domain of furniture, furnishings, and equipment.

The domains sit in four tiers, and each domain has a rank:

| Tier | Rank | Domains                                                                                                                                                                                                                                                                 | What the tier holds                          |
| ---- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1    | 10   | `SUB` substrates, `COT` coatings, `CLR` colors, `GLZ` glazing, `PAT` patterns, `RLF` relief, `WTH` weathering, `LGT` light, `VFX` effects, `SYM` symbols                                                                                                                | Primitives that depend on nothing.           |
| 2    | 20   | `MAT` materials, `PRF` profiles, `KIT` kit parts, `BOT` botanical parts                                                                                                                                                                                                 | Things composed from primitives.             |
| 2    | 25   | `LYR` layered assemblies                                                                                                                                                                                                                                                | Layered assemblies.                          |
| 3    | 30   | `STR` structure, `ENV` envelope, `INT` interior fixed elements, `HDW` hardware, `MEP` mechanical, electrical, and plumbing fixtures, `NET` network and low-voltage devices, `RGH` rough-in runs, `APP` appliances, `FFE`, `SIT` site elements, `LND` landscape planting | Objects a person places.                     |
| 4    | 40   | `CTX` site context                                                                                                                                                                                                                                                      | Data about a site.                           |
| 4    | 45   | `STY` styles                                                                                                                                                                                                                                                            | Styles.                                      |
| 4    | 48   | `SCT` arrangement sets, `SYS` systems                                                                                                                                                                                                                                   | Arrangements of objects and systems of them. |

The specification lists every subcategory.

### The domain classifies, and the kind still says how to read

`kind` stays. It tells a reader how to load and place a file: a `furniture` entry is a model with
dimensions, and a `texture` entry is a tiled image (ADR-0219). The domain says what the thing is. A
reader never branches on a domain to decide how to load bytes.

A taxonomy category goes in the existing `categories` field. In the app, a string the category
registry does not know stays valid and is treated as a plain label, so packs that exist today keep
working and an older app opens a pack built for a newer registry. The pack tool is stricter: it
refuses a string in taxonomy form that the registry lacks. New kinds arrive with their readers.

### One rule orders every reference

An asset may reference another asset only when the rank of its own domain is greater than the rank
of the other's domain.

A reference always points to a lower rank, so no chain of references can return to its start. The
pack tool checks the rule from one pack's manifest, with no payload open and no other pack at hand.
The specification lists what follows from the rule for each tier.

### Objects do not reference objects

A tier 3 object never references another tier 3 object. A window that holds a sash lock declares a
socket, and the socket lists what it accepts as predicates over categories: `HDW.*`,
`HDW.window_sash_casement/*`, or one named asset in any namespace. A predicate is not a reference, so the rule above
does not apply to it.

Which lock sits in which window is a fact about a project. The catalog stays flat at tier 3, and the
placed elements of a project form the tree.

### Assets that react to the site declare inputs

A sky emitter depends on the sun, and foliage depends on the season and the wind. `LGT` and `BOT`
assets do not reference `CTX`, which has a higher rank. They declare named inputs, and the app
supplies the values from the open project when it draws.

A framed layered assembly names its studs as a `PRF` profile and a spacing. It does not reference a
`STR` object.

### The taxonomy lives in two registries

Two registries in `core/registries/` hold the taxonomy, in the pattern of ADR-0006:

- the domains, each with its code, name, tier, and rank;
- the categories, each with its id and a display name. This is the category registry of design
  specification section 4.4.

Both are pure data in `core/`, so the pack tool and the app read one definition (ADR-0024). All 410
categories enter the category registry at once. An author needs the word before the first asset
exists, the data costs a few kilobytes, and the library shows a chip only for a category that an
item carries.

### Changing the taxonomy

Adding a subcategory is an additive change and raises the registry version. Renaming or removing a
subcategory, moving one to another domain, or changing a domain's rank can break published packs,
and each needs a decision record. A code or a subcategory id that has been published is never given
a new meaning.

## Alternatives considered

None of these was taken.

- **Replace `kind` with the domain.** One field would do instead of two. But each reader would need
  its own table from thirty domains to a way of loading, and packs of formats 1 and 2 carry a kind
  and no domain.
- **A separate `domain` field beside `categories`.** It would keep the category list as it is. But
  two fields would carry the same fact.
- **Add each category when its first asset arrives, or tier by tier.** The registry would be
  smaller. But its version would move with every pack, and two authors could not agree on a word
  that is not there yet.
- **Keep free category strings.** This needs no work. But two packs would not share a meaning, the
  library could not offer a category filter that covers both, and there would be nothing to hang a
  dependency rule on.
- **A deeper tree.** Three or more levels would sort finer. Two levels and a slug already name an
  asset, and each extra level makes identifiers longer and moves between categories more frequent.
- **Allow any reference and search for loops.** Authors would have more freedom. But the search
  needs every pack in the catalog, so a pack could not be checked alone, and an imported pack could
  not be checked at all.
- **A taxonomy for each existing registry.** Trim profiles, finishes, and palettes each have a
  registry already. Separate vocabularies would leave nothing that a socket or a library filter
  could use across them.

## Consequences

- The category registry that the design specification promises gets built, with this content.
- The library can offer a category filter once its filter work reaches categories. Until then the
  taxonomy changes nothing a user sees.
- A pack author classifies each asset, and the pack tool refuses a reference that points up or
  sideways.
- The rule is strict. A material cannot reference a profile, and an object cannot reference an
  object. A design that seems to need one has to use a socket, a declared input, or data from a
  lower rank.
- Eleven domains have no kind today, and most others have no reader that uses their contracts.
  Naming them commits the project to the names and to nothing else.
- Several domains overlap an existing registry (palettes, finishes, floor patterns, trim profiles,
  construction profiles, styles). The registry stays the place the app reads from, and a pack asset
  in such a domain adds entries to it. That needs registries a pack can extend at run time, which
  the architecture refactor provides. The registries are constants in the code today.
- Amends: ADR-0006 gets a note that the registry list gains the domain and category registries,
  that registry entries become pack assets (#1127), and that the finish, floor pattern, trim
  profile, and construction profile entries gain display names before they take pack entries.
  ADR-0093 gets a note about the category filter. These are pointer notes, and the decisions they
  point at do not change.

## What stays open

- Which kind and media type each domain with no reader will use. The specification's table shows the
  state on `main`.
- How the `STY` domain and the style and period registries divide their work. `eras` and `styles` in
  a manifest keep using the registry ids.
- Checking a socket's predicates when a person places one object in another. That needs the general
  host relation of the architecture refactor
  (`docs/specs/2026-11-14-architecture-refactor-round.md`, section 5.5). Only an opening has a host
  today.

## References

- `docs/specs/2026-11-23-asset-taxonomy.md`
- `docs/plans/2026-11-23-asset-taxonomy-adoption.md`
- `docs/specs/2026-06-01-vernacular-design.md`, sections 4.4, 4.5, and 4.9
- `docs/specs/2026-11-14-architecture-refactor-round.md`, section 5.5
- [[ADR-0006-registry-pattern]]
- [[ADR-0007-content-addressed-assets]]
- [[ADR-0024-pack-manifest-validation-location]]
- [[ADR-0091-pack-integrity-and-build-pipeline]]
- [[ADR-0093-in-app-asset-library]]
- [[ADR-0219-pack-assets-carry-textures]]
- [[ADR-0229-one-library-over-a-shared-hash-addressed-asset-store]]
- [[ADR-0235-a-catalog-identifier-names-an-asset-beside-its-content-hash]]
- [[ADR-0236-asset-contracts-are-optional-manifest-fields-in-millimeters]]
