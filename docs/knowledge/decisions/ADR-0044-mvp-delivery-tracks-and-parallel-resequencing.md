---
slug: decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing
title: 'ADR-0044: Track-based MVP delivery and re-sequencing'
type: decision
tags:
  [
    architecture,
    roadmap,
    phasing,
    mvp,
    parallelization,
    delivery-tracks,
    dependency-graph,
    scene-graph,
    three-d-preview,
    furniture,
    assets,
    old-house-vocabulary,
    multi-floor,
    stairs,
    export,
    interoperability,
    ifc,
    ifcjson,
    dxf,
    user-experience,
    design-system,
    accessibility,
    webgpu,
    webgl2,
  ]
related:
  [
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0006-registry-pattern,
    decisions/ADR-0005-command-pattern-framework-captured-inverse,
    decisions/ADR-0034-future-direction-extensibility-seams,
    decisions/ADR-0041-phase-1-completion-boundary-finishing-slices,
    decisions/ADR-0007-content-addressed-assets,
    decisions/ADR-0004-three-js-r3f-webgpu,
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0003-storage-provider-pattern,
  ]
sourceFiles: [docs/specs/2026-06-01-vernacular-design.md, ROADMAP.md]
status: current
updated: 2026-06-09
---

# ADR-0044: Track-based MVP delivery and re-sequencing

## Status

Accepted, forward-looking. No feature code lands with this decision. It records
how the remaining MVP work (everything after the Phase-1 two-dimensional plan
editor) is sequenced and parallelized, and it is the corresponding architecture
record for the spec-level changes it makes to the delivery model in
design specification section 10 (the composition of the public alpha, the timing
of export, the addition of a user-experience track, and the open-standard
interoperability posture). Every named deliverable in section 10 still ships; this
ADR changes how the work is grouped and ordered, not the deliverable set.

Update (2026-06-17): the furniture-in-3D step on the assets and furniture track
shipped as solid massing boxes; see [[ADR-0094-furniture-massing-in-3d]]. Loading
real furniture model geometry is tracked separately as a follow-up on the same track.

## Context

The Phase-1 two-dimensional plan editor is complete (twelve build slices plus the
two finishing slices of [[ADR-0041-phase-1-completion-boundary-finishing-slices]]).
Reviewing the remaining MVP phases (specification section 10, Phases 2 through 6)
against the product positioning ("a power user's floor planner with a heavy lean
toward old houses") surfaced three problems with the linear phase chain as
written, plus one open posture question.

1. **The first public release does not demonstrate the differentiator.** The
   public alpha is scheduled at the furniture phase (section 10, Phase 3). At that
   point the product is a single-floor planner with a three-dimensional preview and
   furniture, but with neither the old-house architectural vocabulary that is the
   product's identity nor any way to get a drawing out of the tool. The alpha would
   read as a generic, less-polished planner rather than the tool that respects old
   houses where existing tools do not.

2. **Nothing can leave the tool until the final milestone.** There is no
   `core/export/` layer in the tree at all today, and no vector, document, or image
   export anywhere. The specification places all export in Phase 6, the last MVP
   milestone. A power-user renovator's most basic deliverable is an accurate,
   dimensioned, labeled plan they can print, save as a document, or share, and the
   Phase-1 goal of being "genuinely useful for single-floor planning" is undercut
   while the tool cannot produce a single shareable artifact.

3. **User experience and visual design are rough, and polish is deferred to one
   late pass.** The specification folds the polish work into Phase 6. Deferring it
   forces every intervening surface to be built on an unsettled visual language and
   then re-polished, which is more expensive than establishing the foundation early
   and refining continuously.

4. **No stated posture on open-standard interoperability.** The team wants the
   project's data model to be able to anchor an open standard over time, and wants
   to interoperate with whatever open standards already exist.

The enabling observation is that Phase 1 already shipped the decoupling layer.
The data flow is model, then a pure memoized derivation, then a normalized scene
graph, then the consumers ([[ADR-0018-scene-graph-derivation]]); the registry
pattern ([[ADR-0006-registry-pattern]]) makes new element and system types
declarative data; and all mutation flows through the single dispatch boundary
([[ADR-0005-command-pattern-framework-captured-inverse]]). Together these mean
that for any feature, "what an entity is" (a pure `core/` model plus its
scene-graph derivation, testable in Node) is independent of "how each surface
draws it." A new entity kind is an additive scene-graph projection that the
two-dimensional renderer, the three-dimensional renderer, and the export pipeline
each pick up on their own schedule. The strict linear phase chain therefore
understates how much of the remaining MVP work can proceed in parallel.

## Decision

For the remaining MVP work, replace the strict linear phase chain with parallel
**delivery tracks** that converge on the existing public-alpha, public-beta, and
1.0 milestones. Pull two-dimensional export forward, add a continuous
user-experience track led by a design-system foundation, and adopt an
interoperability posture in which the native model stays and open standards are
implemented as exporters and importers at the seam the specification already
reserves (section 2.2).

### The delivery tracks

Each track is named by its content. Work within a track is largely sequential;
work across tracks is parallel except at two convergence seams (the
three-dimensional-view seam and the asset-pipeline seam) described below.

- **Three-dimensional preview.** The scene-graph-driven three-dimensional shell
  renderer (walls, floors, ceilings, openings), camera and walk navigation, the
  basic lighting provider with the color-temperature slider, the split-pane shell,
  and two-dimensional-to-three-dimensional selection sync. Depends only on
  shipped Phase-1 infrastructure. This is the single largest enabler: the
  three-dimensional renderings of every other track converge on it.
- **Assets and furniture.** The pack format and command-line tooling, the asset
  cache (extending the minimal cache of
  [[ADR-0041-phase-1-completion-boundary-finishing-slices]]), the asset registry
  and resolution and fallback, the curated starter library, the library browser,
  custom import, and the placement tool. Independent of the other feature tracks;
  the only cross-track dependency is that seeing placed furniture in three
  dimensions waits for the three-dimensional preview track.
- **Old-house vocabulary.** The era registry and era tagging, the room-purpose
  registry, surfacing the historic opening vocabulary already shipped in the
  openings slice, the remaining two-dimensional opening shapes (curved, arched,
  bay and bow), the trim system, wall and ceiling features, and wall construction
  profiles. The data, registry, and two-dimensional portions are independent; the
  three-dimensional renderings converge on the three-dimensional preview track and
  the library era filtering converges on the assets track.
- **Structure and multi-floor.** Floor management and navigation (the model is
  already multi-floor; this is mostly commands and a floor switcher), the stair
  entity with its placement, two-dimensional plan symbol, and floor-spanning
  topology, the complete underlay layer (document and scene underlays, trace mode),
  and per-room ceiling-height override. The parametric three-dimensional stair
  geometry, the cutaway preview, and the floor-by-floor three-dimensional view
  converge on the three-dimensional preview track.
- **Output and export.** Vector, document, and image export of the
  two-dimensional plan, built in `core/export/` against the reserved `Exporter`
  interface and driven off the model and the scene-graph derivation. Independent
  of the three-dimensional track for the two-dimensional outputs; the
  three-dimensional snapshot export and the bundle export (which needs the asset
  index for attributions) converge on the respective tracks. Standard-format
  exporters (see the interoperability posture) slot in behind the same interface.
- **Paint and metadata.** The surface-by-surface paint assignment model, the
  palette registry and the color and finish pickers, and the site-metadata
  surface. The model, registry, and picker infrastructure are independent; the
  painted preview converges on the three-dimensional preview track's paint
  material.
- **User-experience foundation.** A design-system foundation (design tokens,
  theming through CSS custom properties, component primitives, the layout shell,
  and empty and loading states) followed by continuous polish on each surface as
  it lands. The foundation depends on the editor shell and the DOM overlay
  ([[ADR-0041-phase-1-completion-boundary-finishing-slices]]) and is a dependency
  reducer for every user-interface-bearing node in the other tracks.

### The dependency graph

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

Read the graph as: every track fans out from the shipped Phase-1 foundation and
can start immediately; the only work that must wait is the bottom row of
convergence nodes, which gate on the three-dimensional preview track, the assets
track, or both.

### The three start-now enablers

Three pieces of work depend only on shipped Phase-1 infrastructure, depend on
nothing in each other, and unblock the most downstream work. They start in
parallel and are staffed first:

1. **The three-dimensional shell renderer**, because the three-dimensional view
   of openings, trim, features, stairs, the cutaway, the three-dimensional
   snapshot export, and the painted preview all converge on it.
2. **The asset cache and registry**, because furniture in three dimensions, the
   library browser, era filtering, the bundle export, and the palette pack all
   hang off it.
3. **The design-system foundation**, because it is a dependency reducer: every
   user-interface-bearing node in the other tracks is cheaper and avoids
   re-polishing when the tokens, theming, and primitives exist first.

### Revised milestone composition

The alpha, beta, and 1.0 milestones stand; their composition is re-grouped along
the tracks so the alpha leads with identity, ships furniture, produces a real
artifact, and is not rough.

- **Public alpha** = Phase-1 editor (done) plus the three-dimensional preview;
  the assets and furniture track delivered and de-risked end to end; the
  identity-bearing front of the old-house vocabulary track (era registry, era
  tagging, room-purpose registry, and surfacing the already-shipped historic
  opening vocabulary); two-dimensional export (vector, document, image); and the
  user-experience foundation.
- **Public beta** = multi-floor and stairs; the three-dimensional renderings of
  the old-house vocabulary; the complete underlay layer; and library era
  filtering.
- **1.0** = paint, palettes, and finishes; site metadata; full export including
  the bundle and standard formats; and the final polish pass.

### Open-standard interoperability posture

The native project model stays. There is no established lightweight open standard
for residential floor plans with room and era semantics; the one real open
building-data standard is the Industry Foundation Classes (now finalized as ISO
16739-1:2024, IFC 4.3), with `ifcJSON` as its web-friendly JSON serialization, and
it is full building-information-modeling, semantically heavy and rigid, a poor fit
as the native model for a lightweight power-user planner and at odds with the
historic vocabulary. Two-dimensional computer-aided-design interchange (DXF) is
geometry only, without room or era semantics. Three-dimensional scene interchange
formats carry geometry, not floor-plan semantics. The posture, therefore:

- Keep the existing model (open-licensed, plain-text, versioned with a migration
  chain, content-addressed, registry-driven) as the source of truth.
- Implement open standards as exporters and importers at the reserved seam
  (section 2.2), behind the `Exporter` and `Importer` interfaces, so they extend
  rather than reshape the model. Prove interoperability with an `ifcJSON` exporter
  within the output track for standards credibility.
- Publish the project schema formally (versioned, documented), with the historic
  extensions namespaced so they do not collide with a future standard, so the
  schema can over time anchor an open reference others implement.

### Stairs are split, not deferred wholesale

The stair entity, its placement, its two-dimensional plan symbol, and its
floor-spanning topology are light and independent of the three-dimensional track,
and land with the structure track. Only the parametric three-dimensional stair
geometry (treads, risers, winders, spiral runs, railings, balusters, newels) is a
large body of geometry code, and it is late only because it converges on the
three-dimensional preview track, not because of any intrinsic ordering constraint.

### The three-dimensional renderer stays within the portable feature set

The WebGL2 backend remains a post-alpha fast-follow ([[ADR-0004-three-js-r3f-webgpu]]).
To keep that additive rather than a retrofit, the MVP three-dimensional renderer
is written to a feature set both backends can express (forward rendering, soft
shadow maps, a paint material that does not require compute shaders or storage
buffers). The work that genuinely leans on the newer backend (baked global
illumination, physically-based reflectance) is past the MVP, so the MVP does not
pigeonhole itself.

### The pull-request clean-code gate is revisited at first external contribution

The continuous-integration job that runs the clean-code reviewer over a full
pull-request diff (specification sections 9.7 and 9.11) remains deferred. It
matters once external contributors open pull requests, which the public alpha
invites; until then the project is solo and the ping-pong audit covers ordering
and independence locally. It is revisited when the repository opens to outside
pull requests, not as an alpha gate by default.

### Spec reconciliation: the full opening vocabulary and construction profiles are Phase 4

Design specification section 2.4 described the full opening vocabulary and the
wall construction profiles as a Phase-5 milestone item, but section 10 (the
authoritative milestone list) places both in Phase 4 (the old-house architectural
shell), and the implementation followed section 10 (construction type was deferred
from wall editing to Phase 4 per
[[ADR-0035-wall-editing-endpoint-move-and-thickness]] and
[[ADR-0041-phase-1-completion-boundary-finishing-slices]]). Section 2.4 is
corrected to read Phase 4, and the mirroring parentheticals in
[[ADR-0034-future-direction-extensibility-seams]] (which introduced section 2.4)
are corrected with it. The old-house vocabulary track above owns this work.

## Consequences

- The public alpha demonstrates the product's identity (old-house-aware,
  two-dimensional and three-dimensional, with furniture and real export) instead
  of reading as a generic planner; the change is a re-grouping of work already
  planned, so it adds no new deliverables.
- A shareable artifact exists far earlier: two-dimensional export moves from the
  final milestone into the alpha, and the export interface doubles as the
  standardization seam.
- User experience improves continuously on a settled foundation rather than in one
  late pass, avoiding build-then-re-polish churn.
- The remaining MVP work is understood as parallel tracks with two explicit
  convergence seams, so staffing and ordering decisions can be made against the
  dependency graph rather than a single chain. The three start-now enablers are
  identified so the most downstream-unblocking work is prioritized.
- The interoperability posture is recorded: the native model is protected, open
  standards are additive exporters and importers, and the schema is positioned to
  anchor an open reference over time.
- The spec's delivery model in section 10 is revised by this ADR (alpha
  composition, export timing, the added user-experience track, the
  interoperability posture). The per-phase deliverable and acceptance definitions
  are unchanged; ROADMAP.md is updated to present the track model and the
  dependency graph.

## Alternatives considered

- **Keep the strict linear phase chain.** Rejected: it serializes work the
  architecture already decouples, ships the alpha without the differentiator, and
  withholds any export until the final milestone.
- **Adopt IFC or ifcJSON as the native model.** Rejected: it is heavyweight
  full building-information-modeling, semantically rigid, and a poor fit for a
  lightweight historic-aware planner; it belongs behind the exporter and importer
  seam, not at the core.
- **Move the public alpha later, after the old-house shell.** Rejected as
  unnecessary: pulling the cheap, identity-bearing front of the old-house
  vocabulary (era and room-purpose registries and surfacing the already-shipped
  vocabulary) into the alpha gives it identity without slipping the milestone, and
  the expensive old-house work stays in beta.
- **Defer the user-experience work to one late polish pass (the original plan).**
  Rejected: it forces every surface to be built on an unsettled visual language
  and re-polished; a design-system foundation early is a dependency reducer.
- **Pull the full asset-and-pack pipeline or multi-floor and stairs into the
  alpha.** Rejected as oversized: the furniture pipeline is alpha-scoped and
  de-risked there, but multi-floor, stairs, and the three-dimensional old-house
  renderings are genuinely beta-weight and stay there.

## References

- Design specification `docs/specs/2026-06-01-vernacular-design.md`: section 2.2
  (extension points, the reserved `Exporter` and `Importer` seam), section 6.1
  (scene graph as the intermediate representation), section 6.12 (the export
  pipeline in `core/export/`), and section 10 (the MVP phasing this ADR
  re-sequences).
- ROADMAP.md (updated alongside this ADR with the track model and the dependency
  graph).
- [[ADR-0018-scene-graph-derivation]], [[ADR-0006-registry-pattern]], and
  [[ADR-0005-command-pattern-framework-captured-inverse]]: the decoupling layer
  that makes the tracks parallel.
- [[ADR-0041-phase-1-completion-boundary-finishing-slices]]: the Phase-1
  completion boundary and the minimal asset cache and DOM overlay this builds on.
- [[ADR-0034-future-direction-extensibility-seams]]: the additive seams the tracks
  keep open.
- [[ADR-0007-content-addressed-assets]], [[ADR-0004-three-js-r3f-webgpu]],
  [[ADR-0021-2d-plan-rendering-interaction]], and
  [[ADR-0003-storage-provider-pattern]]: the asset, rendering-backend, plan-render,
  and storage decisions the tracks extend.
- Open-standard landscape: Industry Foundation Classes / ISO 16739-1:2024 and the
  buildingSMART-community `ifcJSON` serialization; DXF as two-dimensional
  computer-aided-design interchange.

```

```
