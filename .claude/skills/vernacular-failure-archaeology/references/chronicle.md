# The chronicle: full evidence tables

Companion to the vernacular-failure-archaeology SKILL.md. Every SHA below was resolved with
`git show` against `main` on 2026-07-05. PR merge SHAs come from `gh pr view <n> --json mergeCommit`.
All paths are repo-relative.

## 1. Z-fighting at shared datums

The recurring defect class of the 3D preview: two faces occupy the same plane by design, and the
depth buffer draws them in an unstable order. Six ADRs over roughly four weeks, converging on one
mechanism (the ordered depth-bias ladder) plus three geometry-side fixes.

| Step | ADR      | Symptom                                                                                  | Fix commit(s)                                                                                                      | Doc commit                         | Landing                   |
| ---- | -------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------- |
| 1    | ADR-0102 | Flicker at wall bases when orbiting (issue #224): wall base cap and slab top share Y = 0 | `e79231b3` (bias slab top back), `11e2182a` (carry bias into painted floor)                                        | `246007c4`                         | merge `6950cfdb`          |
| 2    | ADR-0129 | Stitching along shared edges of adjacent room slabs                                      | `56e1f732` (stop shared interior slab edges at the wall centerline)                                                | `c67b0357`, accepted in `2fa3ebb9` | PR #399, merge `7f70f445` |
| 3    | ADR-0133 | Lawn z-fights the finished floor where ground plane meets slab top                       | `7ae00a38` (bias ground plane behind slab top), `db4b34db` (derive it from the slab rung)                          | `e7f9b167`                         | direct on main            |
| 4    | ADR-0134 | Residual stitching from floating-point corner drift after polygon offsetting             | `5f0f1ade` (snap polygon-offset corners to a sub-micrometer grid), `02c7f372` (drop redundant topology-layer snap) | `f130302b`                         | direct on main            |
| 5    | ADR-0141 | Sash frame z-fights the window reveal; furniture base cap z-fights the floor             | `d5f5c7bc` (window reveal rung), `ed8a9bf7` (furniture base-cap rung)                                              | `1854fc8d`                         | PR #425, merge `b5ffbee6` |
| 6    | ADR-0150 | Adjacent slab side faces coplanar on the shared wall centerline plane                    | `79c7029f` (inset slab side faces off the centerline)                                                              | `30ccf2cf`                         | PR #463, merge `f5b098a1` |

The ladder (ADR-0133, extended by ADR-0141): each coplanar-by-design role gets a `polygonOffset`
rung derived from the rung in front of it, so the whole ladder is one strictly increasing sequence
readable from the constants themselves. The current rung table has one maintained home,
vernacular-rendering-defect-campaign (Lane C); read the constants from source with
`grep -n DEPTH_BIAS engine/materials/role-appearance.ts`.

Key source files: `engine/materials/role-appearance.ts`, `engine/scene/ground-plane.ts`,
`engine/scene/room-builder.ts`, `core/geometry/polygon.ts`.

Settled rule: a new surface coincident with an existing datum joins the ladder as a derived rung,
in `role-appearance.ts`, with a test pinning its order. Never a private epsilon, never geometry
moved off the spec datum. ADR-0129/0150 show the complementary move when the coincidence is
edge-on rather than face-on: change the geometry so the faces stop being coplanar at all.

## 2. Cross-architecture visual baselines (open as of 2026-07-05)

Three baseline tiers exist (tier mechanics and refresh commands: see vernacular-validation-and-qa).
This saga is why they are shaped the way they are.

Learned constraints, in discovery order:

1. arm64 linux chromium and amd64 linux chromium render different pixels for the same page; no
   tolerance safely absorbs the gap (ADR-0117, Alternatives).
2. amd64 chromium cannot launch under qemu emulation on an arm64 Mac, so a dev Mac cannot render
   the amd64 story family at all (ADR-0117).
3. The scene tier needs a real GPU stack; ubuntu CI runners have none, so `-darwin` scene baselines
   are dev-Mac Metal (ANGLE) renders and CI historically never executed scene specs (ADR-0149).
4. Headless chromium on a GPU-less ubuntu runner falls back to SwiftShader, a pure-CPU rasterizer
   that reports WebGL 2 and renders the harness byte-identically across fresh launches (probe
   results recorded in ADR-0152's Context; issue #401).
5. SwiftShader pixels do not match Metal pixels, so linux needs its own family, rendered on the
   runner class that later diffs it (ADR-0152).

Timeline:

| Date            | Event                                                                                                                                                                                                                                                                                                          | Evidence                                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06 (early) | App-visual spec self-skips when the current platform's baseline PNG is missing, with a regenerate hint                                                                                                                                                                                                         | `e2e/tests/visual-regression.spec.ts` lines 5-18                                                                                                        |
| 2026-06-23      | Story visual diff made advisory because committed baselines were arm64-docker renders that amd64 CI could not match                                                                                                                                                                                            | `bbfaadf4`, PR #323 merge `4a0bafbb`                                                                                                                    |
| 2026-06-24      | Story baselines re-rendered on the amd64 ubuntu runner itself via `refresh-story-baselines.yml`; diff re-gated                                                                                                                                                                                                 | `61d499c2` (the on-main evidence commit; PR #338's merge SHA was orphaned by a later history rewrite and survives only in GitHub's PR record); ADR-0117 |
| 2026-07-04      | `webgl2-probe.yml` workflow_dispatch probe: ubuntu headless chromium creates WebGL2 via SwiftShader, deterministic across launches                                                                                                                                                                             | PR #461 merge `cfb763e1`; issue #401                                                                                                                    |
| 2026-07-05      | Linux scene lane: platform-keyed launch flags in `playwright.config.ts` (Metal flags on darwin, none elsewhere), `-linux` family committed beside `-darwin`, two skip layers (in-spec WebGL2-context probe; decide-job gate on committed `*-scene-webgl-linux.png`), seeding via `refresh-scene-baselines.yml` | PR #478 merge `a3ffe7e8`; ADR-0152                                                                                                                      |

State on disk as of 2026-07-05:

- App tier: only `-darwin` files in `e2e/tests/visual-regression.spec.ts-snapshots/` (chromium,
  firefox, webkit). No `-linux` family committed, so the tier self-skips on linux CI.
- Story tier: 87 `-linux.png` files in `e2e/stories/__screenshots__/`, amd64-runner-rendered.
- Scene tier: paired `-darwin` and `-linux` files in both `scene-visual-regression.spec.ts-snapshots/`
  and `scene-solar.spec.ts-snapshots/`.

Still open: the `-darwin` scene family has no CI gate of its own (a dev-Mac render is trusted at
commit time); live-view WebGPU specs skip on runners because SwiftShader has no WebGPU; the linux
scene lane merged today and its steady-state behavior is unproven.

## 3. Harness readiness flake

Symptom: scene-solar baselines shipped without the visible sky they were supposed to be lit by;
re-captures were racy because the screenshot fired on the mount frame while the sky texture attach
resolved asynchronously.

| Step      | Commit     | What it did                                                                                                                                                                      |
| --------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RED       | `9650d003` | Expose sky-attach readiness from the solar lighting provider                                                                                                                     |
| GREEN     | `a11ff3d9` | Render the harness frame after the lighting reports ready                                                                                                                        |
| Doc       | `b0e7132f` | ADR-0149: `LightingProvider.whenReady()`; harness draws a mount frame plus a ready frame; wrapper stamps `data-harness-ready="true"` in the same React commit as the ready frame |
| Landing   | `86b5f340` | PR #458 merge: "fix: capture the visible sky in the scene-solar baselines"                                                                                                       |
| Extension | `03ab87e5` | Gate the harness ready frame on ambient-occlusion settlement, before the AO baselines landed (ADR-0151 doc `8a016e28`; PR #474 merge `37eeb091`)                                 |

Contract: specs await the `data-harness-ready` attribute; the attribute is the whole
synchronization surface. A failed async load (for example a sky chunk) still flips readiness after
its catch-and-warn fallback, so the diff shows a missing sky instead of a timeout. Any new
asynchronous render resource (textures, post-processing accumulation, IBL) must join
`whenReady()` before its baselines can be trusted.

## 4. Near-wall fade reversal chain

The behavior reversed three times before settling. Chain on main, oldest first:

| Phase                        | Commits                                            | Behavior after this phase                                                                                                                                                                           |
| ---------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fade introduced (issue #122) | doc `6d2891a8` (ADR-0086)                          | Exterior walls between camera and interior go transparent, always                                                                                                                                   |
| Reversal 1: walk mode        | `48fc34a2`, `9b8cce16`, doc `1b70f5b7`             | Fade restores to opaque outside orbit mode (inside the building it read as a glitch)                                                                                                                |
| Reversal 2: camera position  | `7c12206c`, `1d6b9dbe`, `006d08e7`, doc `6a0b8cc7` | Fade fires only when the orbit camera is outside the building footprint (`cameraOutsideBuilding` in core)                                                                                           |
| Reversal 3: user control     | `3c5c973d`, `a3b18e55`, `4b569a44`, doc `18a02e8e` | "Reveal interior" toggle in the scene nav toolbar, default on, still orbit-only; state threads through `useSceneNavigation` and gates `<NearWallFade enabled={mode === 'orbit' && revealInterior}>` |

Coordinated fade members, added as each was found visibly left behind by a fading wall:

- Openings fade with their host wall: ADR-0087.
- Junction fill: tagged addressable (`79022b45`) and enrolled hold-opaque (`f6ef51a8`), ADR-0103
  (doc `c1521077`); made conditional in ADR-0140.
- Wall-attached furniture: paired at framing time (`8880181f`), ADR-0145.

ADR-0086 records the whole arc, including the shipped toggle. The broader navigation unification
issue (#257) remains open. The live-view reconciler path does not enroll opening fills or attached
furniture: issue #437, open as of 2026-07-05.

## 5. ADR numbering collisions

Renumber incidents on main:

| Commit     | Renumber                                                                    |
| ---------- | --------------------------------------------------------------------------- |
| `b7a60a3f` | preservation ADR to 0051 after the command palette took 0050                |
| `db0e3cd9` | surface-paint ADR to 0056 (PR #70, merge `140ed332`)                        |
| `a63f03a0` | three-dimensional-preview ADR to 0057 (PR #71, merge `cbe3ecb7`)            |
| `1f4288ec` | pan ADR to 0070 to avoid colliding with the visual-design ADR               |
| `1f68bf35` | whole-building 3D view ADR to 0127                                          |
| `4c0adfa8` | ground-plane ADR to 0131                                                    |
| `18e8a65c` | surface-edge-overlay ADR to 0132                                            |
| `e8cd175f` | slice-0 lighting ADRs to 0142 and 0143 after the ADR-0141 collision on main |

Unresolved duplicates still on disk (verified `ls docs/knowledge/decisions/` 2026-07-05):

- `ADR-0076-three-dimensional-floor-slab-under-walls.md` and `ADR-0076-wordmark-typeface.md`
  (wordmark landed via `07927acb`).
- `ADR-0081-three-dimensional-opening-fill.md` and `ADR-0081-canvas-resolves-design-tokens-at-runtime.md`
  (canvas tokens landed via `a4174038`, extended `3ba9af54`).

Cross-references inside ADRs use full slugs, so links resolve despite the duplicates; a bare
"ADR-0076" or "ADR-0081" in prose is ambiguous. Both z-fighting ADRs cite the floor-slab 0076 by
full slug.

Missing numbers with no file on disk: 0002, 0008, 0009, 0010, 0011, 0013, 0014, 0015. Citations
that dangle as of 2026-07-05:

| Number | Cited by                                                                        |
| ------ | ------------------------------------------------------------------------------- |
| 0002   | `.claude/rules.md` rule 2 (license)                                             |
| 0009   | `.claude/rules.md` rule 14 (RGB TDD)                                            |
| 0010   | `.claude/rules.md` rule 5 (cooldown)                                            |
| 0011   | `.claude/rules.md` rule 15, `ARCHITECTURE.md` (agent system)                    |
| 0013   | `.npmrc` comment, ADR-0016/0100/0105/0110/0111 and others (cooldown exclusions) |
| 0014   | `docs/plans/2026-06-02-storybook-playwright-axe.md` (hooks and release tooling) |
| 0015   | ADR-0016 (Storybook, Playwright, axe scaffold)                                  |
| 0008   | no citation found                                                               |

These early ADRs predate the decision to commit `docs/knowledge/decisions/` and were lost to
history rewrites; the numbers are effectively burned. Do not reuse them and do not repoint the
citations without owner sign-off.

## 6. The ADR supersession graph

| Old      | New      | Scope                                                                                          | Where stated                                                   |
| -------- | -------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| ADR-0055 | ADR-0060 | Full: buffered polyline wall drawing replaced by immediate commit                              | 0055 frontmatter `status: superseded`; 0060 Status             |
| ADR-0077 | ADR-0080 | Full in effect: junction geometry generalized to n-way; two-way corner reduces to 0077's miter | 0080 Status ("successor to"); 0077 frontmatter still `current` |
| ADR-0031 | ADR-0099 | Partial: only the y-down rendering note; the projection model stands                           | 0099 Consequences                                              |
| ADR-0048 | ADR-0056 | Partial: the deferral of 2D paint rendering                                                    | 0056 Decision heading                                          |
| ADR-0065 | ADR-0142 | Partial: tone-mapping reasoning ("extends and partly supersedes")                              | 0142 body                                                      |
| ADR-0012 | ADR-0017 | Full for the boundaries config: the v5-form config "was a no-op for the wrong reason"          | 0017 body                                                      |

Self-reversals recorded inside a single ADR:

- ADR-0139: the 3D preview rendered as a left-right mirror of the plan. The fix corrects
  `planToWorld` (plan north to world -Z, orientation-preserving), removes the winding
  compensation from every cap builder, and explicitly corrects the foundation spec's section 2.1
  y-down text. The ADR is the record of that spec correction.
- ADR-0143: reverses two of its own plan choices in flight: timezone lives on `Site`, not on
  `ObservationInstant` (an investigation note had it the other way), and `environmentScenes` is
  optional rather than the planned required array, because the required field would have broken
  about thirty hand-built `Project` fixtures.

## 7. Walk-mode collision and the crash-recovery branch duplicates

Walk-mode collision (ADR-0135, doc `ca6bd4e1`, cross-referenced from source in `f90b72c7`):

| Symptom                                            | Fix                                                                                                                            | Commit                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Fast per-frame moves tunneled through walls        | `sweepWalkCollision(from, to, world)`: sub-steps no longer than the walker radius, each resolved against the running position  | `71bc54ab`                                       |
| Walker stood off the wall centerline, not its face | Clearance becomes `radius + thickness / 2`; wall thickness carried onto collision segments and preserved across opening splits | `62edf104` (test `07bb0ef4`)                     |
| Doors and furniture ignored                        | Open doors and furniture footprints feed the collision world                                                                   | `85e65602`, `0b9cbefa`; PR #393 merge `4300c260` |

Crash recovery shipped once: OPFS write-ahead snapshots, ADR-0119 (doc `558919ee`), landed via
PR #331 (merge `7d5e1032`, wiring commit `c0259321`). Two local branches are abandoned duplicates
of that wiring and predate its landing shape:

- `fix/wire-crash-recovery-production` (tip `4755c830`): re-wires recents plus crash recovery into
  the entry point; overlaps `c0259321` and `f556c96c` on main.
- `fix/durable-recent-projects` (tip `5ad97e0f`): re-wires the durable recent-project list;
  overlapped by the same main-line wiring.

Both are unmerged (`git log main..<branch>` is non-empty) and should stay that way. There is no
unlanded work in them worth mining; treat them as historical artifacts.

## 8. Release-gate scars

All on main; the release runbook itself lives with vernacular-run-and-operate.

| Scar                                                 | Evidence                                                                                                                                                                                                                                       | Lesson                                                                                                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| First release would not version itself               | `3e58cc71` "fix(release): bootstrap first release to 0.1.0"                                                                                                                                                                                    | A fresh release-please setup needs an explicit bootstrap version                                                                                                         |
| Release-As left configured would pin future releases | `09747983` "chore(release): drop release-as now that v0.1.0 has shipped", PR #13 merge `ac905217` (merged 2026-06-02, same day as v0.1.0)                                                                                                      | Release-As is a one-shot override; remove it immediately after it fires                                                                                                  |
| v0.3.0 miscounted as a patch                         | `d325606d` "chore: request the 0.3.0 release", commit body: the ".building rename since v0.2.0 is a breaking change, so semver calls for 0.3.0 rather than the patch that the audit-desynced tag history inferred", footer `Release-As: 0.3.0` | History rewrites orphan tags and desync release-please's commit audit; when the inferred bump is wrong, force it with a Release-As commit footer and say why in the body |
| Stale release PR stuck on the required check         | `95cc95d7` "chore: synchronize the release branch to rerun the merge gate"                                                                                                                                                                     | `ci-complete` only re-runs on a new push; synchronize the release-please branch to clear it                                                                              |

Tags on main: v0.1.0 at `0a69f832` (2026-06-02), v0.2.0 at `75566a1a` (2026-06-09), v0.3.0 at
`e16a55c7` (2026-06-27). Numerous `backup/*` refs carry pre-rewrite history: the tags
`backup/pre-rewrite-wave1` and `backup/pre-history-rewrite-*`, the branches
`backup/*-pre-window`, and others.
Any SHA that resolves only under `backup/*` is dead history: never cite it in an ADR, issue, or
skill.

## 9. Issue #457 postmortem, in full

Filed 2026-07-04 as "Split view gives the 3D preview pane half its intended share, collapsing the
live canvas" after first being investigated as environment drift. Closed same day. Fix merged as
PR #459 (`336444c2`).

Misdiagnosis phase (recorded in the issue body):

- `scene-live-view.spec.ts` ("reflects a drawn wall in the split-view 3D pane") failed on the dev
  Mac: canvas mounted but never left the React Three Fiber 300x150 default; the 5-second settle
  poll timed out.
- Bisect said "not a regression": identical failure at post-merge main (`d7735b89`), pre-merge
  main (`47443b36`), and the v0.3.0 tag (`e16a55c7`), each freshly built in a clean worktree.
- The other 23 scene-webgl specs passed in the same runs. Earlier runs (2026-07-03) had the whole
  project self-skipping. Conclusion at the time: a Chrome for Testing or macOS update changed
  WebGPU adapter behavior.

Root-cause phase (recorded in the owner's closing comment):

1. WebGPU was healthy: `requestAdapter()` and `requestDevice()` resolved in the exact scene-webgl
   browser; the canvas held a live `webgpu` context; zero console or page errors.
2. The canvas's flex container measured 149px wide and 0px tall.
3. `SplitBody` in `editor/viewport/view-mode-viewport.tsx` set the inline `flex-basis` only on the
   plan pane; with both panes at `flex-grow: 1` the preview pane's real share was about 19 percent
   of the row.
4. At 149px wide the scene nav toolbar stacked vertically past the column height and the camera
   pane (`flex: 1; min-height: 0`) collapsed to exactly 0. R3F left the canvas at its mount
   default because the measured pane had no height.
5. The one-sided basis shipped with the original splitter, `9bfbf420` (2026-06-11). It stayed
   latent while the toolbar was short; the toolbar grew across the building-scope, presets,
   reveal-interior, surface-edges, and color-temperature slices until the stacked height crossed
   the column height. That is why old tags failed identically: both the bug and a tall toolbar
   predate v0.3.0.

Fix: give the preview pane the complementary inline flex-basis (PR #459). User-facing: at common
laptop widths the split view had been giving users a sliver or blank 3D pane.

Durable lessons:

- "Reproduces at every old revision" does not prove environment drift. It equally fits a latent
  bug multiplied by a monotonically growing input (here, toolbar height).
- For any blank or default-sized canvas: measure `clientWidth`/`clientHeight` on the canvas and
  each ancestor before touching GPU flags. A renderer initializes happily in a 0-height box.
- A canvas stuck at exactly 300x150 is the R3F/HTML default size: the container was never
  measured, which is a layout fact, not a rendering fact.
- One residual oddity was left explicitly unexplained (the 2026-07-03 whole-project self-skips),
  and `navigator.gpu` is absent on `about:blank` in that Chrome build, which matters for future
  probes. Recording what remains unknown is part of the postmortem standard here.

## Verification one-liners

```
# Any SHA in this file:
git show -s --format="%h %s" <sha>

# Confirm a SHA is on main and not only on a backup branch:
git merge-base --is-ancestor <sha> main && echo on-main

# PR facts:
gh pr view <n> --json state,mergedAt,mergeCommit,title

# Issue facts:
gh issue view <n> --json state,title,closedAt
```
