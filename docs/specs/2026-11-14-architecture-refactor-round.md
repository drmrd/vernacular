# Architecture refactor round: target structure and sequence

Status: approved by the project owner, 2026-11-14. The owner took the decisions listed in section 4 on that date and approved the rest of this document, including the order of work and the pairings in section 6, the same day.

## 1. Why this document exists

An architecture review of `main` at `c788d0b2` looked at Vernacular the way one would look at any design and modeling application: presentation, application and document state, the geometric kernel, data exchange, and rendering. The layer boundaries held up. No production file imports upward, only `engine/` imports Three.js, and every model change goes through `dispatch`. The problems are inside the layers and in the contracts between them.

Three findings drive this round.

- Several paths can lose what the user saved (#669 to #673, and #678).
- Room derivation, the plan renderer, and the 3D wall builder each derive wall geometry on their own, so they can disagree, and they do (#674, #675).
- A new kind of element costs far more than `docs/delivery-strategy.md` assumes. A kind is listed by hand at about 60 places in 48 files, and the lists already disagree: move, copy, and marquee selection handle walls, openings, and dimensions and skip the rest.

The public-beta milestone is mostly new kinds of element and new tools. Twenty of its open issues depend on one of the areas described here. Building them on the current structure would pay the same cost each time and would put parallel lanes into the same shared files.

This is an umbrella specification. It records the target structure, the decisions already taken, the order of work, and what done means for each area. It does not design any area in code-level detail. Each area gets its own specification and plan just before its work starts, because detail written now would be stale by then.

## 2. Goals, non-goals, and anti-goals

Goals:

1. No path loses or silently alters what the user saved.
2. A project knows where it lives. Two projects can exist side by side, and a project opened from a folder saves back to that folder.
3. Plan geometry is derived once per floor in `core/`, and every consumer reads the same result.
4. Adding a kind of element is a bounded change: one descriptor per layer and no edits to shared lists.
5. The whole editor can be driven without React: open a document, use a tool, undo, export.
6. The live 3D view and the test harness assemble the scene through the same code.
7. Lint and tests enforce the rules that keep this structure, so the rules do not depend on a reviewer noticing.

Non-goals:

- New user-facing features, apart from the public-beta features paired with an area in section 6.
- The visual redesign. The Arris migration (#500) continues on its own plan. Section 6 says where the two meet.
- A constraint solver for driving dimensions. This round builds its prerequisites only (section 5.4).
- A design for renovation comparison (#494). This round keeps both candidate models possible (section 5.5).
- Curved walls themselves (#80). This round builds the seam they need and pairs its first slice with the kernel work.

Anti-goals. Any of these would make the round a failure even if the code came out cleaner. The owner confirmed all four.

- A long-lived rewrite branch. Every step lands on `main` through a green pull request with the usual red, green, blue cycle.
- A saved project that stops loading. Every document from schema version 8 onward must still open after every step.
- An abstraction with no consumer. Each new seam lands together with at least one real use.
- A behavior change hidden in a refactor. A step preserves behavior or it fixes a named issue. If a visual baseline changes, the pull request says why.

## 3. Constraints

- The hard invariants in `.claude/rules.md` still apply. ADR-0175 changes the layer list, and the invariants that name layers change with it.
- The project is before 1.0, so the file format may change. Each change still needs a migration and a release-note entry.
- The 30-day dependency cooldown applies. This round should need no new runtime dependency.
- Work runs in parallel lanes. Steps are cut so that two lanes do not edit the same files.

## 4. Decisions already taken

| Decision                                                                                                                                          | Record               |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Add a seventh layer, `session/`, for application state and logic with no React and no Three.js. `bridge/` keeps only React adapters.              | ADR-0175             |
| Commands and their inverse steps are plain data. Undo history lasts for the session and is not saved.                                             | ADR-0176             |
| A change in progress is an open transaction. Every view reads the document with the transaction applied.                                          | ADR-0177             |
| `schemaVersion` counts breaking changes. A new optional `schemaRevision` counts additive ones and needs no migration step.                        | ADR-0178             |
| Domain rules live in the command handlers, which can reject a command with a typed reason.                                                        | ADR-0179             |
| User settings go through one settings port in `storage/`.                                                                                         | ADR-0180             |
| Lengths are millimetre numbers under one tolerance model. A typed value is never authoritative.                                                   | ADR-0181             |
| Order of work: stop data loss, then document identity and the command layer, then each remaining area together with a feature that proves it.     | Section 6            |
| Driving dimensions get an issue now and their own design round later. Renovation comparison is not designed here, but neither model is ruled out. | Sections 5.4 and 5.5 |

## 5. Target structure

### 5.1 Layers

| Layer     | Holds                                                                      | May import                  |
| --------- | -------------------------------------------------------------------------- | --------------------------- |
| `core`    | The pure domain: model, geometry, topology, commands, derivation, format   | nothing in the repo         |
| `storage` | Stores, archive and folder formats, the asset cache, the settings port     | `core`                      |
| `session` | Application state and logic with no React, no Three.js, and no DOM globals | `core`, `storage`           |
| `engine`  | The Three.js scene, renderers, and loaders                                 | `core`                      |
| `bridge`  | React adapters over `session` and `engine`                                 | `core`, `session`, `engine` |
| `editor`  | The React interface                                                        | `core`, `session`, `bridge` |
| `app`     | The composition root and routes                                            | every layer                 |

`session/` is new (ADR-0175). Application logic with no React is spread across three layers today: `bridge/session`, about 72 files in `editor/plan` that depend only on `core/`, and the service hooks in `app/`. Goal 5 needs that logic in one place.

Seven files in `bridge/` and about a dozen in `editor/` import `storage/` today. Those uses move behind `session/`, and lint keeps allowing the import until they have moved.

What moves:

- From `bridge/`: the editor session, autosave, and the selection and view stores go to `session/`. The 3D viewport code goes to `engine/` behind the scene view object (section 5.6). The visible interface, about 990 lines, goes to `editor/`.
- From `editor/`: the tool state machines, the command registry, and key routing go to `session/`. Pure geometry such as hit testing and snapping, about 1,800 lines, goes to `core/`.
- From `app/`: the open, save, import, and export flows, which are React hooks today, go to `session/`. `app/` becomes the composition root.
- From `engine/`: the pure wall math, about 250 lines of `engine/scene/wall-builder.ts`, goes to `core/`.

The moves happen in stages, each with the work that needs it.

### 5.2 Document identity and persistence

Today the application has one project slot with the fixed id `'current'` (`app/app.tsx:50`), and a session does not know where its project is stored.

- A document handle binds a session to a document id, a store, a location, and a lock. A session cannot exist without one.
- One document codec in `core/` turns a parsed file into a document (migrate, validate) and a document back into a file (validate, encode). Every store uses it. The stores and the archive reader in `storage/` only move bytes and assets. Today the folder stores migrate and preserve unknown fields while the IndexedDB store does neither (#672).
- The codec knows the schema, so it can tell an unknown field, which it keeps, from a known optional field the user cleared, which it drops (#669).
- Migration backups live where the autosave prune cannot reach them (#670).
- Assets travel with documents. Import copies an archive's assets into the cache (#673), and every durable store has a durable asset cache.
- The handle takes a lock so two tabs cannot write the same document. The lock manager exists today but only the end-to-end test hook uses it.
- Archive reading has size and entry-count limits, and validation runs in production builds, against the current schema (#631).
- User settings (snap preferences, theme, design language, unit precision) go through the settings port (ADR-0180).

### 5.3 Commands

Today a command is a string `type` plus untyped `params` (`core/commands/command.ts:7-18`), an undo step is a closure, and a change notification carries no data.

- A typed command map links each command type to its parameters and its handler at compile time.
- A handler validates its command and can reject it with a typed reason (ADR-0179). One function in `core/` holds each rule, and the editor calls the same function for live feedback during a drag.
- Inverse steps are data (ADR-0176). History can then be inspected, and the diagnostic export in design specification section 7.6 becomes possible.
- The dispatcher reports a change set: which elements were created, changed, and removed. Subscribers and caches use it instead of inferring changes from object identity, which is how a wall kept a stale height after its floor changed (#676).
- A transaction groups commands into one undo step (ADR-0177). Deleting a mixed selection takes one undo step for each furniture piece today.
- An open transaction is how a change in progress is shown. The plan, the 3D view, and the inspector all read the document with the transaction applied. Releasing the pointer commits it, Escape discards it, and autosave ignores it.

### 5.4 The geometric kernel

Today the wall graph is built three times from the same function: in `core/topology/rooms.ts:126`, `editor/plan/draw-plan.ts:446`, and `engine/scene/wall-scene-helpers.ts:11`. Each call maps its own inputs, and the plan and the 3D builder then derive footprints and miters separately. The scene graph carries raw centerlines, and "the same point" means 1 mm, 1e-6, 1e-9, or exact equality depending on the module.

- One tolerance module defines what coincident and parallel mean (ADR-0181). No other module carries its own epsilon.
- One derived plan geometry per floor holds the wall graph, wall footprints with their miters, junction fills, opening spans, room boundaries, and addressable faces. The scene graph carries it, and the plan renderer, the 3D builder, room derivation, and export all read it.
- One function enumerates the scene graph. There are two today, and the live view misses a field that the harness sees (#675).
- Consumers reach wall geometry through a centerline accessor. ADR-0034 recommended one, but none exists yet, and 74 places read wall end points directly. This round creates it, and it is the seam curved walls need.
- Degenerate input is handled on purpose. A wall that overlaps a room's edge makes the room disappear today (#681). Room identity is the sorted list of bounding wall ids, so splitting a wall at a tee renames the room and detaches its overrides.
- Property-based tests cover the derivation.

Driving dimensions, where a typed length becomes a rule the geometry must keep, are a later feature with their own design round. They need four things from this round: the tolerance model, a uniform element reference (section 5.5), dimensions that refer to elements instead of storing raw points, and transactions (section 5.3).

### 5.5 Kinds of element

- Each kind has a descriptor, split by layer. In `core/`: the data shape, scene derivation, bounds, hit testing, plan drawing primitives, transform, clipboard behavior, rules, and the accessible label. In `editor/`: the inspector fields. In `engine/`: the 3D builder. Hit testing sits in `core/` so that tools in `session/` can use it.
- Shared operations iterate the descriptors: move, copy, marquee, delete, export, and the accessibility proxies. No operation keeps its own list of kinds.
- One element reference, `{ kind, id }`, is used everywhere: selection, hit results, 3D picking, and commands. Furniture uses a raw id in some places and a prefixed id in others today, and a placed piece ends up selected under an id that nothing matches (#679).
- A general host relation lets any kind attach to a wall. Only openings can today. Trim, wall features, and fixtures need the same relation.
- Every kind carries the same common attributes. `extensions` is one; furniture lacks it today. This is also where a per-element phase (existing, removed, new) would go if renovation comparison (#494) takes that shape. The document handle keeps the other shape possible, which is two linked documents.
- Registries are resolved at run time. The session owns a registry context and packs merge into it. Today the registries are compile-time constants and the merge function has no production caller, so a pack cannot add an element type. A pack adds types as data to a kind that already exists. A new kind is code and ships with the application. The pack format question in #409 is separate from this.

### 5.6 The 3D view

Today two paths assemble the 3D scene: `engine/scene/build-scene.ts` for the harness and `bridge/react/floor-build.ts` with a reconciler for the live view. Most baselines exercise only the first.

- One scene view object in `engine/` owns the scene. It is created with a canvas, updated from a scene graph and a change set, and it can render, pick, and dispose.
- The harness and the live view both use it, so a baseline tests the code the user sees.
- Every GPU resource has an owner, and replacing a build disposes the old one (#434).
- The order of work inside a frame is written down in one place. One owner writes the tone-mapping operator (#680).
- `bridge/` mounts the scene view in React and does nothing else for 3D. Camera state lives in `session/`.

### 5.7 Tools and input

Today every tool hook is always mounted, 41 checks in 22 files compare a tool id, pointer and keyboard keep separate state machines for the same tool, and twelve `keydown` listeners sit on the window.

- A tool is a pure state machine that takes input events and returns commands, transaction steps, and a preview. `editor/plan/wall-tool.ts` already has this shape and is the model.
- One machine per tool takes both pointer and keyboard input (#597).
- A tool registry replaces the tool id comparisons. Adding a tool does not touch shared files.
- One gesture primitive handles pointer capture, cancel, the drag threshold, and the mapping from event to world coordinates (#589).
- One keyboard router with a stack of scopes replaces the window listeners. A modal scope blocks what is beneath it (#595, #599). The router implements the keyboard model of ADR-0155.
- The command registry covers every command, including tool selection, fit, rotate, the clipboard, and floors.

### 5.8 Plan drawing and export

Today every render repaints all 20 passes, the canvas was a fixed 800 by 600 bitmap (the container half landed early in ADR-0228 for #646; the device pixel ratio half stays with #690), and the SVG exporter is a second renderer that omits stairs, furniture, and underlays.

- One plan drawing model in `core/` describes what to draw for a floor. It is derived from the scene graph and the plan geometry.
- The canvas, SVG, and PDF outputs all render that model. A kind drawn once appears in all three.
- Export produces sheets: one floor per page, at a stated scale.
- Exporters return bytes through one interface. Importers get an interface too, and underlay import moves out of `editor/`.
- The canvas follows its container and the device pixel ratio (#646). The hit-test index is computed once per scene-graph version.

### 5.9 Enforcement

- Lint enforces the purity rules with restricted imports and globals, an import order inside each layer, and no import cycles. Warnings fail CI. They do not today, and 43 pass.
- Each layer has a deliberate public surface. `core/index.ts` exports 687 symbols today, and 309 of them have no user outside `core/`.
- `app/` builds every service in one place. No context falls back to a silently created instance.
- The harness and the end-to-end hook load lazily and stay out of the production entry.
- `scripts/`, `e2e/`, and `.storybook/` are type-checked (#556).

### 5.10 Concerns that cut across areas

- Errors are contained. Each pane has an error boundary, one taxonomy names the error classes, and `session/` owns the notification channel. A failure in `bridge/` or `engine/` reaches only the console today.
- Performance is measured. Nothing measures the budgets in design specification section 6.10 today. A baseline for plan redraw and 3D frame time lands in the first stage so later stages can show they did not regress.
- One function in `core/` produces the accessible label for an element. The 2D and 3D proxies disagree today.
- Localization is not part of this round. The descriptors keep user-facing strings in one place per kind so a later message catalog has a single seam.

## 6. Order of work

The order is: stop data loss, then document identity and the command layer, then each remaining area together with a public-beta feature that proves it. The round has a tracking issue in the public-beta milestone, #682, that links the issues for every stage. The status of the round lives there.

| Stage | Work                                                                              | Paired feature                                      | Issues it settles            |
| ----- | --------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------- |
| 1     | Local fixes for data loss. Lint warnings fail CI. A performance baseline.         | none                                                | #669, #670, #671, #678       |
| 2     | The `session/` layer, the document handle, the codec, the settings port.          | the Projects page                                   | #588, #591, #631, #672, #673 |
| 3     | Commands: typed map, data inverses, change sets, rules in handlers, transactions. | live drag feedback in the 3D view and the inspector | #676, #677                   |
| 4     | Kernel: tolerances, plan geometry, one scene-graph enumeration.                   | the first slice of #80 curved walls                 | #674, #675, #681, #546       |
| 5     | Kinds of element: descriptors, element references, hosting, run-time registries.  | #428 duplicate and paste, #429 mirror               | #679                         |
| 6     | The 3D scene view object.                                                         | #169 stair 3D geometry                              | #434, #680, #612, #666       |
| 7     | The plan drawing model and export.                                                | #432 export at a true scale                         | #646                         |
| 8     | Tools and input.                                                                  | #430 measure tool, and the Arris tool rack          | #589, #595, #597, #599, #583 |
| 9     | Closing proof: add a kind without editing a shared list.                          | #431 text annotations, then #364 trim and features  | none                         |

Stage 2 comes before stage 3 because transactions live in the session. Stage 3 comes before stages 5 and 8 because shared operations and tools emit transactions. Stage 4 comes before stage 5 because descriptors read the plan geometry. Stages 6, 7, and 8 can run in parallel after stage 5, since builders, drawers, and placement tools register through descriptors. Stage 9 needs all of them.

Why these pairings:

- The Projects page is how a user sees document identity. Once two projects can exist in storage, the user needs a page that lists them. The owner added this pairing on 2026-11-15 (ADR-0187).
- Live feedback during a drag is the open transaction at work. The 3D view and the inspector follow the pointer, and Escape cancels. Deleting a mixed selection in one undo step comes with it.
- Duplicate, paste, and mirror have to work for every kind and each be one undo step. They show that shared operations iterate the descriptors, so they belong with stage 5 and not with the command layer.
- An arc wall segment is the smallest change that forces every consumer through the centerline accessor.
- A text annotation is the simplest new kind, but it needs a placement tool and export as well as a descriptor. It can be added without touching a shared list only after stages 5, 7, and 8, so it closes the round. Trim and wall features follow because they need the host relation.
- Stairs have no 3D builder at all today, so the first one can be written against the scene view object.
- Export at a true scale needs sheets and vector output, which is what the plan drawing model provides.
- The measure tool stores nothing in the model, so it tests the tool contract and little else.

Where this meets the Arris migration (#500): component families that do not touch tools or the keyboard can proceed independently. The tool rack and the status rail land with stage 8. The live length and angle readout (#502) reads the open transaction from stage 3.

Other public-beta features wait for the stage they depend on: #433 and #77 on stage 5, #86 on stages 4 to 6, #380 and #392 on stages 5 and 6, #256 and #257 on stage 6, #378 and #379 on stages 4 and 6, and #34 on stages 3 and 7.

## 7. What done means

Each condition is a test or a lint rule.

Data loss and guard rails:

- Clearing any optional field, saving, and reloading leaves the field cleared.
- An autosave after a migrated load leaves the pre-migration backup in place.
- A project started after a failed load never writes to the failed project's slot.
- A command that rebuilds a floor or the project meta keeps `extensions`.
- CI fails on a lint warning.

Document identity and persistence:

- Two projects coexist in the workspace store, and opening one does not change the other.
- Where the browser grants folder access, a project opened from a folder saves back to that folder.
- Every store passes one conformance suite: migrate on load, preserve unknown fields, keep assets.
- An archive exported with assets and imported into an empty workspace is identical, assets included.
- A document at every schema version from 8 to current opens through every store.
- A test opens a document, edits it, undoes, saves, and exports with no React import in the test.

Commands:

- A command with the wrong parameters does not compile.
- No path can place two overlapping openings on one wall: pointer, keyboard, paste, or a direct dispatch.
- Deleting a mixed selection is one undo step.
- During a drag the 3D view and the inspector show the same value as the plan. Escape restores the prior state with no history entry, and autosave never writes a half-finished drag.
- A cache keyed on the change set returns a fresh wall height after the floor's ceiling height changes.

Kernel:

- The wall graph is built once per floor per change, and room derivation, the plan, and the 3D view read the same object.
- Exactly one module defines a geometric tolerance.
- A room bounded by construction-profile walls reports the area between the drawn faces.
- The overlapping-wall cases in #681 each yield the expected rooms.
- No file outside the kernel reads `wall.start` or `wall.end`.
- A length typed in the wall tool reads back the same after save and reload, for every inch fraction down to 1/64 and every metric value down to 0.1 mm.

Kinds of element:

- Every existing kind has a descriptor, and no shared operation names a kind.
- Move, copy, marquee, delete, and export handle every registered kind.
- Selection, hit results, and 3D picking carry the same element reference.
- A pack can add an element type, as data, to an existing kind at run time.

The 3D view:

- The harness and the live view produce the same scene from the same scene graph, shown by a test.
- GPU resource counts return to their starting values after repeated edits.
- One module writes the tone-mapping operator.

Plan drawing and export:

- The canvas, the SVG, and the PDF of one floor contain the same elements.
- A PDF at 1/4 inch to the foot measures correctly on paper.
- The plan fills its pane at any window size and is sharp on a high-density display.

Tools and input:

- A tool started with the pointer can be finished from the keyboard, and the reverse.
- No `keydown` listener is attached to the window outside the router.
- A modal dialog blocks every global key binding.
- Adding the measure tool edits no shared file.

Closing proof:

- Adding the text annotation kind edits no shared list. The change is its descriptors, their registration, a placement tool, and tests.

## 8. Left to the area specifications

- The names and exact signatures of the document handle, the codec, the transaction, the descriptors, the scene view object, and the tool contract.
- How handlers produce data inverses and change sets: recorded patches, or a comparison of the slices they replaced.
- The tolerance values. They must sit far below the smallest display step (1/256 inch is about 0.1 mm) and far above floating-point rounding at building scale. The kernel specification derives them.
- Whether `coalesceWith` survives once transactions exist. Only the stair and project handlers use it today.
- How room identity survives a wall split, and the migration for existing room overrides.
- The import order inside each layer. The review proposed one for `core/`: units, color, and geometry; then the model; then registries, eras, and assets; then topology; then scene, environment, and paint; then clipboard and commands; then format, migrations, and export.
- Whether `bridge/` and `editor/` keep any type-only import from `storage/` or `engine/` once their uses have moved behind `session/`. The answer is no for both. For `storage/`, see `docs/specs/2026-11-15-session-layer-and-document-identity.md`, section 5.1. For `engine/`, ADR-0175 lets `bridge/` import it in full, and `editor/` imports nothing from it.
- What a second tab sees when it opens a document that another tab has locked. The proposal was a read-only view with a notice. ADR-0189 answers it: the second tab shows the Projects page, and there is no read-only view.
- How the plan drawing model handles text measurement, which differs between canvas and PDF.

## 9. Changes to other documents

These changes landed with the approval of this document.

- Design specification section 7.1: history is per session and is not saved (ADR-0176).
- Format specification section 7: `schemaRevision` and the reading rules (ADR-0178).
- `docs/delivery-strategy.md`: its claim that a new kind of element is an additive projection is the target of section 5.5, not the current state. The page now says so and describes this round.
- ADR-0001, ADR-0059, and ADR-0122 are superseded in part by ADR-0175, ADR-0180, and ADR-0179. ADR-0005 is amended by ADR-0176. ADR-0051 is superseded in part, and ADR-0047 amended, by ADR-0178. Each carries a note that points to its successor.

These wait for the stage that creates `session/`, because they describe the code as it is.

- `ARCHITECTURE.md`, `CLAUDE.md`, `.claude/rules.md`, and design specification section 2: the layer list and the invariants that name layers (ADR-0175). Edits to `CLAUDE.md` and `.claude/rules.md` need owner sign-off.

## 10. Risks

- The round is long. Stage 1 has no paired feature, stage 2 brings the Projects page, and stage 3 shows only as better feedback during a drag, so most new features wait until stage 4. Stage 1 is small, and stages 2 and 3 fix issues users can hit, which is the reason they come first. The Projects page also makes stage 2 larger than this document first assumed (ADR-0187).
- The `session/` layer invites argument about what belongs in it. ADR-0175 gives a placement rule that settles most cases: code that needs React belongs in `bridge/` or `editor/`, code that needs Three.js belongs in `engine/`, a pure function of the document belongs in `core/`, and the rest is `session/`.
- A descriptor can become a place where everything is optional. Each descriptor field needs at least two kinds that use it before it is added.
- Moving geometry into `core/` can change pixels by a rounding step. Each such move is checked against the baselines, and a change is either explained or fixed.
- Parallel lanes and a moving structure collide. Each stage names the files it owns before lanes start.
