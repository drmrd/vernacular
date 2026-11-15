# Delivery strategy

Vernacular is built as a set of parallel delivery tracks that converge on three release milestones: a public alpha, a public beta, and 1.0. This page is the durable narrative behind that plan: the track model, the order the work runs in, and what each milestone contains. The live status of any single piece of work lives on GitHub, not here.

**Live status.** Every work item is tracked on GitHub: release scope on the [milestones page](https://github.com/drmrd/vernacular/milestones) and per-item status on issues. Milestones and issues are the source of truth for what has shipped and what is planned; this document does not repeat per-item status. The design reasoning behind the track model is in [ADR-0044](knowledge/decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing.md), and the authoritative product design is the [design specification](specs/2026-06-01-vernacular-design.md).

## Why parallel tracks

Phase 1, the two-dimensional plan editor, shipped as release 0.2.0 and brought with it the decoupling layer the rest of the work needs: scene-graph derivation, the registry pattern, and a single command-dispatch boundary. The aim of that layer is that a new entity kind is an additive scene-graph projection that the two-dimensional renderer, the three-dimensional renderer, and the export pipeline each pick up on their own. What an entity is stays independent of how each surface draws it, and that independence is what let the MVP work run as parallel tracks rather than a strict phase chain.

The aim is only partly met. An architecture review in November 2026 found that a kind is still listed by hand in about 60 places across the layers, and that the lists disagree, so a new kind costs much more than a projection. The architecture refactor round described below closes that gap before the public beta adds more kinds.

## Delivery tracks

Each track has an independent portion that depends only on the shipped Phase-1 foundation and can start right away, and (for most tracks) a smaller portion that converges later on another track.

| Track                      | Independent (start-now) portion                                                                                                                      | Converges later on                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Three-dimensional preview  | shell renderer, camera and walk, basic lighting and color-temperature slider, split-pane, selection sync                                             | nothing (it is the convergence target)                             |
| Assets and furniture       | pack format and CLI, asset cache, asset registry and resolution, library, custom import, placement (2D)                                              | furniture in three dimensions (3D preview)                         |
| Old-house vocabulary       | era registry and tagging, room-purpose registry, surfacing shipped vocabulary, curved 2D openings, trim and feature data, construction profiles (2D) | three-dimensional renderings (3D preview); era filtering (library) |
| Structure and multi-floor  | floor management, stair entity and 2D symbol and floor-spanning topology, complete underlay, per-room ceiling height                                 | stair 3D geometry, cutaway, floor-by-floor 3D (3D preview)         |
| Output and export          | vector, document, and image export of the 2D plan in `core/export/`; standard-format exporters                                                       | 3D snapshot export (3D preview); bundle export (asset index)       |
| Paint and metadata         | paint assignment model, palette registry, color and finish pickers, site metadata                                                                    | painted preview (3D preview paint material)                        |
| User-experience foundation | design tokens, theming, component primitives, layout shell, empty and loading states, then continuous polish                                         | nothing (it feeds every other track's UI)                          |

## Dependency graph

Every track fans out from the shipped Phase-1 foundation and can start immediately. The only work that must wait is the bottom row of convergence nodes, which gate on the three-dimensional preview track, the assets track, or both.

```
        Phase-1 foundation (shipped): project model, scene-graph derivation,
        command dispatch, registries, hit-test and snapping, transforms,
        DOM overlay, two-dimensional renderer
                                  |
   +-----------+-----------+------+------+-----------+-----------+-----------+
   v           v           v             v           v           v           v
 3D          Assets &    Old-house     Structure   Output &    Paint &     User-
 preview     furniture   vocabulary    & multi-    export      metadata    experience
                                       floor                               foundation
 shell       pack CLI    era registry  floors      SVG export  paint model design
 renderer    asset cache room purpose  stair 2D    PDF export  palettes    tokens
 camera /    asset reg.  surface       + topology  PNG (2D)    color and   theming
 walk        library     historic      complete    standard    finish      component
 lighting +  browser     vocabulary    underlay    exporters   pickers     primitives
 color-temp  custom      curved 2D     (doc/scene, (ifcJSON,   site        layout
 split-pane  import      openings      trace)      DXF)        metadata    shell
 + selection placement   trim data                                        empty and
 sync        (2D)        wall/ceiling                                      loading
                         features                                         states
                         construction
                         profiles (2D)
   |           |           |             |           |           |           |
   +-----------+-----------+------+------+-----------+-----------+-----------+
                                  |
            Convergence nodes (each gates on the 3D preview track,
            the assets track, or both):
              - furniture in three dimensions          (needs 3D preview)
              - three-dimensional openings, trim,
                wall and ceiling features               (needs 3D preview + data)
              - parametric stair geometry, cutaway,
                floor-by-floor three-dimensional view   (needs 3D preview + structure)
              - painted preview                         (needs 3D preview + paint material)
              - library era filtering                  (needs library browser + era registry)
              - bundle export with attributions        (needs asset index)
```

## Why this order

Three pieces of work depend only on shipped Phase-1 infrastructure, depend on nothing in each other, and unblock the most downstream work, so they run in parallel and are staffed first:

1. **The three-dimensional shell renderer**, because the three-dimensional view of openings, trim, features, stairs, the cutaway, the snapshot export, and the painted preview all converge on it.
2. **The asset cache and registry**, because furniture in three dimensions, the library browser, era filtering, the bundle export, and the palette pack all hang off it.
3. **The design-system foundation**, because it lowers the cost of everything else: every interface-bearing node is cheaper to build, and avoids a second polish pass, once the tokens, theming, and primitives exist first.

## Milestone composition

- **Public alpha** is the Phase-1 editor (done) plus the three-dimensional preview; the assets and furniture track delivered and de-risked end to end; the identity-bearing front of the old-house vocabulary (the era registry, era tagging, the room-purpose registry, and surfacing the already-shipped historic opening vocabulary); two-dimensional export (vector, document, image); and the user-experience foundation. The alpha leads with the product's identity, ships furniture, produces a real export artifact, and is reasonably polished.
- **Public beta** is multi-floor and stairs; the three-dimensional renderings of the old-house vocabulary; the complete underlay layer; library era filtering; and the architecture refactor round, which the new beta features are built on.
- **1.0** is paint, palettes, and finishes; site metadata; full export including the bundle and standard formats; and the final polish pass.

## The architecture refactor round

The public beta is mostly new kinds of element and new tools, and the November 2026 review showed that the structure under them needed work first. Some paths could lose what a user saved. The plan, the three-dimensional view, and room derivation each worked out wall geometry on their own and could disagree. A new kind had to be added by hand to dozens of shared lists. The response is a round of structural work, specified in [`docs/specs/2026-11-14-architecture-refactor-round.md`](specs/2026-11-14-architecture-refactor-round.md) and decided in ADR-0175 through ADR-0181.

The round runs in stages, and every stage lands on `main` through ordinary pull requests. There is no rewrite branch. It starts with the fixes for data loss. Next come a `session/` layer for application logic that needs no React, a document that knows where it is stored, and a command layer with typed commands, transactions, and rules enforced in the handlers. The remaining areas follow: one derived plan geometry, a descriptor for each kind of element, one owner for the three-dimensional scene, one drawing model behind the canvas and the exports, and one contract for tools and input.

From the command layer on, each stage lands together with a public-beta feature that proves it. Live feedback during a drag proves transactions, for example, and the first curved wall segment proves the geometry seam. The round closes when a text annotation, a new kind, can be added without an edit to any shared list. Other beta features wait for the stage they depend on, so the round sets the order of much of the beta. Its tracking issue, [#682](https://github.com/drmrd/vernacular/issues/682), carries the status.

## Open-standard interoperability

The native project model stays the source of truth. There is no established lightweight open standard for residential floor plans with room and era semantics; the one real open building-data standard, the Industry Foundation Classes (ISO 16739-1:2024, with its `ifcJSON` serialization), is full building-information-modeling and belongs behind the reserved exporter and importer seam, not at the core. Open standards land as exporters and importers within the output track, where an `ifcJSON` exporter proves interoperability, and the project schema is published formally, with the historic extensions namespaced, so it can anchor an open reference over time. The published format already carries a normative specification, the Vernacular Floor Plan Format ([`docs/specs/2026-06-10-vernacular-floor-plan-format.md`](specs/2026-06-10-vernacular-floor-plan-format.md) and [ADR-0047](knowledge/decisions/ADR-0047-published-floor-plan-data-format-standard.md)), which defines the packaging tiers; the registry-typed, reserved-namespace, and reverse-DNS extension seams; and a CORE JSON Schema generated from the `core/model` types and published under `schema/<version>/`. See [ADR-0044](knowledge/decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing.md).
