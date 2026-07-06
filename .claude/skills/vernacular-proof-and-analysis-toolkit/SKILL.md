---
name: vernacular-proof-and-analysis-toolkit
description: Use when about to tweak an epsilon, tolerance, depth bias, or lighting constant instead of deriving it; when a new surface z-fights (polygonOffset, depth-bias ladder); when the live 3D view diverges from the harness scene (reconciler parity); when a pixel test flakes and renderer nondeterminism is suspected (WebGL2 probe); when a screenshot races async work (readiness gate); when reading a Stryker mutation report; or when proving a schema migration safe for old documents.
---

# Vernacular proof and analysis toolkit

## Overview

Prove the property at the cheapest deterministic layer instead of tuning constants until a
screenshot looks right. Every recipe here has the same shape: state the property, find the
layer where it is an exact assertion, derive any constant from an explicit ordering or
invariant, and let the expensive stochastic tier (GPU pixels) only guard integration.

## When to use

- You are about to add or change a numeric constant (bias, inset, tolerance, intensity) and
  cannot yet say what it is derived from.
- A rendering defect involves coincident surfaces, the live-vs-harness split, capture
  timing, or suspected renderer nondeterminism.
- You need to argue that a schema migration, a lighting change, or a test-suite gap is safe.

## When NOT to use

- Running or interpreting the measurement tools themselves: see
  vernacular-diagnostics-and-tooling.
- Sequencing a multi-defect rendering investigation into decision-gated phases: see
  vernacular-rendering-defect-campaign.
- The gate map, baseline tiers, and how to add tests: see vernacular-validation-and-qa.
- Symptom-first triage of a failure you have not classified yet: see
  vernacular-debugging-playbook.
- Floor-plan geometry and color-science theory behind these methods: see
  vernacular-domain-reference.

## Quick reference

| #   | Recipe                              | Reach for it when                                       | Key sources                                                                   |
| --- | ----------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Prove geometry in Node              | Deciding where a rendering fact gets asserted           | ADR-0061, ADR-0065                                                            |
| 2   | Depth-bias ladder derivation        | A new surface is coplanar with an existing one          | ADR-0102, ADR-0133, ADR-0141, ADR-0150; `engine/materials/role-appearance.ts` |
| 3   | Dual-path parity audit              | Live 3D view lacks something the harness shows          | `engine/scene/build-scene.ts`, `bridge/react/framed-scene-reconciler.ts`      |
| 4   | Determinism probing                 | Separating renderer nondeterminism from test flakiness  | `scripts/ci-probes/webgl2-probe.mjs`, PR #461                                 |
| 5   | Readiness analysis                  | A captured frame races async scene work                 | ADR-0149, ADR-0151; `bridge/react/scene-harness-view.tsx`                     |
| 6   | Photometric calibration obligations | Before tuning materials or a color gate (open item)     | issue #449; `engine/lighting/lighting-rig.ts`                                 |
| 7   | Mutation-score analysis             | Judging whether core/ tests actually constrain behavior | `stryker.conf.json`, `.github/workflows/mutation.yml`                         |
| 8   | Migration-safety reasoning          | Any schema version bump                                 | `core/migrations/migrate.ts`, `core/migrations/schema/`                       |

## Recipe 1: prove geometry in Node, absorb GPU variance in tolerances

**When.** Any time you are choosing where a rendering-related fact gets asserted. The wrong
choice is to encode a geometric or material fact in a pixel baseline.

**The principle** (ADR-0061, extended by ADR-0065): tier-one Node tests on the built scene
objects are the gating proof of correctness. They run without a GPU, are deterministic, and
catch flipped normals, wrong dimensions, missing material groups, and missing entity ids.
The tier-two visual render exists only to catch what a render alone shows: a miswired
light, a material that does not draw, geometry off screen. So the visual tier is
pixel-approximate, never pixel-exact, because GPU output varies with driver and
antialiasing, and an exact diff turns environment differences into spurious failures.

ADR-0065 refines the split into three bands:

1. Pure math lives in `core/` and is pinned exactly in Node (example: `kelvinToLinearRgb`
   tested for endpoints, monotonicity, clamping, peak normalization).
2. Engine routines are tested against built Three.js objects with no graphics context
   (example: the light-color update sets sun and hemisphere colors; the shadow pass flags
   meshes).
3. Glue that only runs under a real render (sliders, canvas wiring) stays
   coverage-excluded and is proven end to end.

**Steps.**

1. Write the property as a sentence about numbers or object structure, not pixels.
2. Push it to the deepest band where it is an exact assertion: `core/` math, then engine
   built-object structure, then (last resort) a pixel check.
3. Assert exact values in the Node test. Do not add a tolerance there; tolerances belong
   only to the pixel tier.
4. Leave the pixel tier tolerant: scene specs use per-pixel `threshold` 0.35 and
   `maxDiffPixelRatio` 0.05 (constants at the top of `e2e/tests/scene-solar.spec.ts` and
   `e2e/tests/scene-visual-regression.spec.ts`); the app visual suite uses 0.02
   (`playwright.config.ts`). Never tighten a pixel tolerance to catch a geometry bug, and
   never loosen a Node assertion because a pixel diff moved.

**Worked example.** The z-fighting fixes in recipe 2 were each proven in Node: the ladder
ordering test in `engine/materials/role-appearance.test.ts` (describe block "depth-bias
ladder") asserts the strict polygonOffset order, and
`engine/scene/room-builder-side-faces.test.ts` asserts two adjacent rooms' slab side faces
land off the shared centerline plane. The rendered result was confirmed by the owner's
visual check, because z-fighting is angle dependent and a static pixel baseline is a weak
witness (stated in ADR-0133 and ADR-0150 consequences).

## Recipe 2: depth-bias ladder derivation

**When.** You introduce a surface that is coplanar-by-design with an existing surface
(shared datum, flush fit) and the two shimmer or bleed through each other. Never invent a
new free-standing epsilon or nudge geometry off its datum: place the surface in the ordered
ladder and derive its bias.

**The ladder today**: every constant lives in `engine/materials/role-appearance.ts`, each
derived from its predecessor so the strict ordering is visible in the code itself. The
current rung table has one maintained home, vernacular-rendering-defect-campaign (Lane C);
read the constants from source with `grep -n DEPTH_BIAS engine/materials/role-appearance.ts`.

**Derivation steps for a new coincident surface.**

1. Decide the winner: which surface should the viewer see at the shared plane? The winner
   stays unbiased (or keeps its current rung); the loser gets the new rung.
2. Check the roles. If both coincident faces draw the SAME material role, the ladder cannot
   order them: a role-keyed offset lands on both and cancels. That case takes a geometric
   step instead (see below).
3. Find the farthest-back surface the loser must lose to. The new constant is that rung
   plus one: `factor` and `units` each derived as `<predecessor>.factor + 1` and
   `<predecessor>.units + 1`, never a fresh literal.
4. Add the constant plus a `<name>DepthBiasParameters()` helper beside the existing ones in
   `role-appearance.ts`, and spread it into the one material section that carries the role.
   If the losing face is part of a bigger mesh, split it into its own material section
   first (ADR-0141 did this for the furniture base cap).
5. Extend the ladder-order unit test in `engine/materials/role-appearance.test.ts` so the
   full strictly-increasing sequence is asserted.
6. Record the rung in an ADR. The coincident-surface chain to link into is ADR-0102, 0129,
   0133, 0134, 0141, 0150 (0129 and 0134 are geometric siblings in the same saga, not
   rungs). Get an owner visual check; the pixel baseline moves only if it drifts.

**Two facts that make the ladder work in edge cases** (proven in ADR-0141):

- A transparent, non-depth-writing material can still be ordered: `polygonOffset` shifts
  the depth used in the depth TEST, not only in a write, so a big enough rung makes the
  face lose to the opaque surface it rests on (the furniture base cap case).
- Same-role, back-to-back faces with opposite normals are the ladder's hard boundary.
  ADR-0150 solved that case (adjacent rooms' slab side skirts at the shared wall
  centerline) with geometry: a `SLAB_SIDE_FACE_INSET_MM` = 0.1 mm inboard step in
  `engine/scene/room-builder.ts`, chosen to be above float32 resolution at the maximum
  plan extent and below any visible threshold. Division of labor, stated in ADR-0150: the
  ladder orders same-normal surfaces stacked at a shared datum; geometry separates
  back-to-back opposite-normal faces sharing one role.

**Worked history.** ADR-0102 biased the slab top so the wall base wins. ADR-0131 then added
the ground plane at the same Y = 0 datum with no bias, and the lawn drew over every
ground-floor room: a one-sided rule says which of two surfaces loses but nothing about a
third. ADR-0133 generalized to the ordered ladder; ADR-0141 added the depth-test-only
furniture rung and the reveal rung; ADR-0150 closed the last case geometrically. Issue #391
(the umbrella) is closed as of 2026-07-05.

## Recipe 3: dual-path parity audit

**When.** Something renders in the harness or one-shot preview but not in the live editor
view, or you just changed scene assembly. The repo has two assembly paths: the one-shot
builder `engine/scene/build-scene.ts` (used by `buildFramedScene` in
`bridge/react/framed-scene.ts` and the harness) and the incremental live path
`bridge/react/framed-scene-reconciler.ts` (ADR-0088 incremental updates, ADR-0089
within-floor mesh reuse). The reconciler re-implements assembly for caching, so every
behavior added to the one-shot path must be explicitly checked there. This divergence is a
named weak point; the live path has no pixel coverage (issue #469), so parity findings must
be proven with reconciler unit tests.

**Steps.**

1. Read `buildScene` and `buildFloorGroup` top to bottom (the file is 78 lines) and write a
   behavior ledger: every group added, every side effect, in order.
2. Read `buildFramedScene` in `bridge/react/framed-scene.ts` for the post-build
   enrollments the one-shot path adds.
3. Grep `bridge/react/framed-scene-reconciler.ts` (and `engine/scene/floor-subgroups.ts`,
   its per-sub-group builders) for each ledger row. Confirm equivalence or record a gap.
4. File one issue per missing behavior, citing both files, and prove the gap with a test in
   `bridge/react/framed-scene-reconciler.test.ts` or
   `framed-scene-reconciler-reuse.test.ts`.

**The current ledger.** The cluster's status snapshot and per-issue fix sketches have one
maintained home: vernacular-rendering-defect-campaign, references/worked-examples.md (the
live-view parity cluster). Re-verify issue states with the gh one-liner in Provenance
below. Re-run steps 1 through 3 whenever either file changes; any written ledger is a
snapshot, not a contract.

## Recipe 4: determinism probing

**When.** A GPU-dependent test fails intermittently and you need to know whether the
renderer itself is nondeterministic in that environment before blaming (or "fixing") the
test.

**The pattern** (PR #461, which answered issue #401's first open question): strip the app
away entirely and probe the raw rendering substrate with a minimal, fixed-input,
exact-readback script.

`scripts/ci-probes/webgl2-probe.mjs` does exactly this for headless WebGL2 on linux CI:

- Launches chromium under a flag matrix (default, `--use-gl=angle --use-angle=swiftshader`,
  `--use-gl=swiftshader`), escalating to `--enable-unsafe-swiftshader` variants only if no
  base config yields a context.
- In each config: creates a 64 px canvas, requests a `webgl2` context, reads the unmasked
  renderer and vendor strings, clears to a fixed color, reads back all pixels, computes a
  checksum over every byte, and compares the first pixel against the expected value within
  a tolerance of 2.
- Prints one JSON line per config as it completes, so partial results survive a crash, then
  a summary and a verdict. It always exits 0: a config that fails to produce a context is
  a valid finding, not a script failure.
- Dispatched manually by `.github/workflows/webgl2-probe.yml` (workflow_dispatch only; no
  push or PR trigger, so it changes nothing about gating CI).

**Why this isolates nondeterminism from flakiness:** fixed inputs plus a full-buffer
checksum means two runs of the same config either match byte for byte or the renderer
itself is nondeterministic; no app code, no timing, no layout is in the loop. The renderer
string tells you which backend you actually got.

**Steps for a new probe.**

1. Reduce to the smallest render that exhibits the question (a clear color is enough to
   prove a context works; add one triangle only if shading is in question).
2. Fix every input; read back the full buffer; checksum it.
3. Run a matrix of environment variants; emit machine-readable evidence incrementally.
4. Post the evidence to the issue and decide there. Never exit nonzero from a probe: it
   gathers evidence, it is not a gate.

**Outcome of the worked example:** the probe's evidence led to the linux scene-baseline
lane (PR #478, merged; ADR-0152); issue #401 is closed as of 2026-07-05.

**Counter-lesson:** not every "renderer flake" is the renderer. One scene-live-view failure
was a layout bug (a split-view pane collapsing the canvas to its default size; fixed by PR
#459). Before probing the renderer, check the canvas client size. Triage order lives in
vernacular-debugging-playbook.

## Recipe 5: readiness analysis

**When.** A captured frame (screenshot baseline, export, thumbnail) sometimes misses
content that arrives asynchronously. The harness draws with `frameloop="never"`, one frame
per explicit trigger, so anything async that lands after the trigger is silently absent.

**The pattern** (ADR-0149, extended by ADR-0151): enumerate every asynchronous contributor
to the rendered frame, get an explicit settlement signal from each owner, combine them into
a single gate, and advertise the gate as a DOM attribute the capture waits on. Never sleep,
never poll pixels.

**Steps.**

1. Inventory async contributors. Today there are two: the lazily imported sky chunk (the
   solar provider's attach) and the ambient-occlusion pipeline build. A new one (a texture
   load, an environment map, a font) joins the same inventory.
2. Expose settlement from the owner. `LightingProvider` has an optional
   `whenReady(): Promise<void>`; providers with no async resources simply omit the member
   (`engine/lighting/lighting-provider.ts`).
3. Combine into one gate. `useHarnessReadiness` in `bridge/react/scene-harness-view.tsx`
   computes `lightingReady && (!ambientOcclusionActive || ambientOcclusionSettled)`, so
   states that do not use a contributor keep their existing single-signal contract and
   their baselines do not move.
4. Advertise the gate where the test can see it. The wrapper sets
   `data-harness-ready="true"`; React commits the attribute in the same pass whose layout
   effect renders the ready frame, so an observable "true" implies the frame exists. The
   spec waits with
   `expect(page.getByTestId('scene-harness')).toHaveAttribute('data-harness-ready', 'true')`
   (`e2e/tests/scene-solar.spec.ts`).
5. Make the signal mean settled, not succeeded. A failed chunk load or a rejected pipeline
   build still flips readiness, so a broken resource shows up as a visible baseline diff
   instead of a hung spec. Test the failure path settles.
6. Guard against stale signals: the readiness callback carries a cancelled flag so a
   provider swap or unmount cannot report a disposed provider's readiness.

## Recipe 6: photometric calibration obligations (open as of 2026-07-05)

**Status: open, not practiced.** The luminance-calibration ADR is owed; issue #449 (open)
requires it to be written before the slice-3 color-accuracy gate is tuned, "without it the
gate anchors to an arbitrary constant". Nothing below is calibrated yet; `finishId` is dead
data (no engine file reads it) until #449 lands. Treat this section as the checklist the
future ADR must satisfy, not as settled method.

A luminance-calibration argument must pin down:

1. **What the current constants mean.** Sun intensity is `DAYLIGHT_SUN_INTENSITY = 1.6`
   (`engine/lighting/lighting-rig.ts`) and default tone-mapping exposure is 1
   (`renderer.toneMappingExposure = options.toneMappingExposure ?? 1` in
   `engine/renderer/create-renderer.ts`). Neither has stated units or an anchor today. The
   ADR must say what 1.6 at exposure 1 is calibrated to.
2. **The sun-to-sky ratio convention materials are tuned against.** Issue #449 names
   "roughly 5:1 sun-to-sky clear-noon" as the example convention. Note the current rig is
   not that: sun 1.6 against hemisphere fill 0.5 (a legibility choice from ADR-0079, not a
   photometric one), and in solar mode the spherical-harmonics light probe replaces the
   fill (ADR-0148), so the effective ratio is currently an emergent value, not a pinned
   convention.
3. **A color-accuracy gate that includes an indirectly lit surface.** A known paint color
   under neutral daylight must read within a stated tolerance of its reference swatch, and
   the gate must include an interior surface lit by sky ambient and image-based lighting
   rather than direct sun, because bounced daylight dominates perceived interior paint
   color. A direct-lit-only gate can pass while the decorating use case stays wrong.
4. **Which tone-mapping mode the gate reads through.** Per-mode tone mapping (ADR-0147)
   sits between scene luminance and pixels; the harness color-check state
   (`&scene=color-check`, captured by `e2e/tests/scene-solar.spec.ts`) is the existing
   anchor to build on.

## Recipe 7: mutation-score analysis on core/

**The machinery.** `stryker.conf.json` mutates `core/**/*.ts` (tests excluded), runs the
vitest runner against `vite.config.ts` with the typescript checker, and writes an HTML
report to `reports/stryker/mutation.html`. Thresholds: high 80, low 60, break 50 (a score
below 50 fails the run). Commands: `pnpm mutate` (full run), `pnpm mutate:check` (dry run).
The weekly workflow `.github/workflows/mutation.yml` runs Sundays 03:30 UTC, uploads a
`stryker-report` artifact with 14-day retention, and never gates PRs.

**Honest status as of 2026-07-05: the lane has never gone green.** All five scheduled runs
(weekly since 2026-06-07) concluded failure. The latest fails during Stryker startup with
`Cannot find Checker plugin "typescript"` (plugin resolution;
`@stryker-mutator/typescript-checker` 8.7.1 is in devDependencies), so no report artifact
exists and no mutation score has ever been published. No tracking issue was found by an
issue search on 2026-07-05; file one before doing anything else with this recipe, and fix
the plugin loading before any score analysis is possible. The reading guide below is
therefore aspirational here, not practiced.

**Reading the report (once it runs).**

1. Open `reports/stryker/mutation.html` (locally after `pnpm mutate`, or download the
   `stryker-report` artifact). Survived mutants are the signal; the aggregate score is not.
2. For each survived mutant, read the diff and ask: what observable output of a public
   `core/` function could differ under this mutation? Try to write the killing test.
3. Classify as a real gap only if a killing test exists in principle. If the mutation
   cannot change observable behavior (unreachable branch, performance-only change,
   equivalent arithmetic), record it as an equivalent mutant and suppress it with a
   `// Stryker disable` comment carrying the reason, rather than chasing a synthetic 100%.
4. Prioritize survived mutants in geometry, topology, units, and migrations over ones in
   formatting or message-building helpers: `core/` correctness is what every layer above
   trusts.

## Recipe 8: migration-safety reasoning (the v10 through v16 pattern)

**When.** Any schema version bump. The goal is an argument that the migration cannot
corrupt an older document, built from the orchestrator's guarantees plus a per-migration
checklist. Current version: `CURRENT_SCHEMA_VERSION = 16` (`core/model/factories.ts`).

**What the orchestrator already guarantees** (`core/migrations/migrate.ts`, read it before
writing a migration):

- The input is `structuredClone`d before any step runs, so the caller's document is never
  mutated.
- The chain walks one step at a time from the document's `meta.schemaVersion` to the
  target; a missing step throws `MigrationFailedError`; a document NEWER than the target
  throws `UnsupportedSchemaVersionError` (it refuses to guess); a document without a
  numeric `meta.schemaVersion` throws `MalformedProjectError`.
- The orchestrator advances `meta.schemaVersion` after each step. A migration step must
  not touch it.
- Registry migrations run only after the schema chain completes.

**The two shapes every v10-to-v16 step took** (all in `core/migrations/schema/`, registered
in its `index.ts` by `from` version, 9 through 15):

1. **Passthrough** for a new OPTIONAL field: an older document simply omits the field and
   is already valid at the new version, so `migrate` returns the project unchanged
   (examples: `add-site-grade-elevation.ts`, `add-weather-cloud-cover.ts`).
2. **Backfill** for a new required collection: add the default while preserving any value
   already present (`add-environment-scenes.ts` spreads the project and sets
   `environmentScenes` to the existing array if present, else `[]`).

**The safety checklist a new migration and its tests must satisfy** (this is the proof; the
pattern is lifted from `add-weather-cloud-cover.test.ts`):

1. The step only adds; it spreads `...project` and never removes or rewrites an unrelated
   field.
2. A document already carrying the new field passes through with its value preserved
   (asserted by test).
3. The step does not set `meta.schemaVersion` (asserted by test).
4. The test fixture is a plain structural object shaped like a loaded-from-disk old
   document, cast to `ProjectShape`, not a factory-built current document: the migration
   must be exercised exactly as a real old file would arrive.
5. The `from` version is asserted by test.
6. The per-version JSON Schema is committed under `schema/<version>/` so older documents
   validate against the schema they were written for; regenerate with
   `pnpm schema:generate` and confirm no drift with `pnpm schema:check`.

The document format itself (VFPF, ADR-0047) belongs to vernacular-domain-reference; how the
change is gated and reviewed belongs to vernacular-change-control.

## Common mistakes

- Tightening a pixel tolerance to catch a geometry bug, or loosening a Node assertion to
  quiet a pixel diff. Wrong tier both ways (recipe 1).
- Inventing a free-standing epsilon for a coincident surface instead of deriving a ladder
  rung, or adding a rung when both faces share one role (the offsets cancel; use the
  geometric inset pattern, recipe 2).
- Landing a `buildScene` or `buildFramedScene` behavior without checking the reconciler
  ledger, on the assumption the live view shares the code (recipe 3).
- "Fixing" a flaky GPU test before establishing whether the renderer output is even
  deterministic in that environment, or skipping the canvas-size check first (recipe 4).
- Waiting on a timeout or polling pixels instead of an explicit settlement attribute, and
  wiring readiness to mean succeeded so a failed resource hangs the capture instead of
  producing a visible diff (recipe 5).
- Tuning materials or a color gate before the calibration ADR pins what the constants mean
  (recipe 6).
- Citing the weekly mutation lane as evidence of test quality: it has never produced a
  report (recipe 7).
- Testing a migration with a factory-built current document, or advancing
  `meta.schemaVersion` inside the step (recipe 8).

## Provenance and maintenance

All facts verified against the repo and GitHub on 2026-07-05. Volatile items and how to
re-verify each from the repo root:

- Ladder constants and derivation: `grep -n "DEPTH_BIAS" engine/materials/role-appearance.ts`
- Ladder order proof: `pnpm exec vitest run --project unit engine/materials/role-appearance.test.ts`
- Geometric inset: `grep -n "SLAB_SIDE_FACE_INSET_MM" engine/scene/room-builder.ts`
- Scene pixel tolerances (0.35 / 0.05): `grep -n "SHELL_THRESHOLD\|SHELL_MAX_DIFF_PIXEL_RATIO" e2e/tests/scene-solar.spec.ts`
- Parity ledger status (#479, #437, #434, #469 open; #477 closed as of 2026-07-05):
  `for i in 477 479 437 434 469; do gh issue view $i --json number,state,title --jq '"\(.number) \(.state) \(.title)"'; done`
- Reconciler single-floor gap: `grep -n "graph.nodes\[0\]" bridge/react/framed-scene-reconciler.ts`
- Probe script and workflow: `ls scripts/ci-probes/webgl2-probe.mjs .github/workflows/webgl2-probe.yml`
- Readiness contract: `grep -n "data-harness-ready" bridge/react/scene-harness-view.tsx e2e/tests/scene-solar.spec.ts`
- Sun intensity and exposure defaults: `grep -n "DAYLIGHT_SUN_INTENSITY = " engine/lighting/lighting-rig.ts && grep -n "toneMappingExposure" engine/renderer/create-renderer.ts`
- Calibration ADR still owed: `gh issue view 449 --json state,title`
- Mutation lane health (red as of 2026-07-05): `gh run list --workflow=mutation.yml --limit 3`
- Stryker thresholds and mutate target: `cat stryker.conf.json`
- Schema version and migration chain: `grep -n "CURRENT_SCHEMA_VERSION = " core/model/factories.ts && ls core/migrations/schema/`
- Schema drift gate: `pnpm schema:check`
