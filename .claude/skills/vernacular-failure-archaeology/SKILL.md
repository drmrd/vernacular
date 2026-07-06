---
name: vernacular-failure-archaeology
description: 'Use when a Vernacular defect looks like a re-fight of a settled battle: z-fighting or depth-bias shimmer, cross-platform visual-baseline drift (darwin vs linux, arm64 vs amd64, SwiftShader), scene-harness screenshot flake, near-wall fade oddities, duplicate or missing ADR numbers, superseded ADRs, walk-mode wall tunneling, release-please gate stalls, or a failure that smells like environment drift. Keywords: z-fight, depth bias ladder, baseline, renumber, supersede, Release-As, flex-basis.'
---

# Vernacular failure archaeology

## Overview

This is the chronicle of battles this repo already fought: symptom, root cause, evidence, and how each one ended. Read the matching saga before "fixing" anything that resembles one, because most of these have a settled rule and re-fighting them wastes a session. Full commit-level detail lives in [references/chronicle.md](references/chronicle.md).

## When to use

- A 3D surface flickers or stitches where two faces meet (walls, slabs, lawn, sashes, furniture).
- A visual baseline diff fails, skips, or cannot be regenerated on your platform.
- A scene screenshot looks under-lit, sky-less, or noisy compared with its baseline.
- Walls fade (or fail to fade) unexpectedly in the 3D preview.
- Two ADR files share a number, or a cited ADR number has no file.
- An ADR's stated decision contradicts newer code.
- The walk camera clips through or sticks to a wall.
- A release-please PR will not merge or proposes the wrong version.
- A test failure "reproduces at every old revision", which smells like environment drift.

## When NOT to use

- Triaging a live bug from symptoms: use vernacular-debugging-playbook (it owns the symptom-to-triage table).
- Baseline tier mechanics, tolerances, and refresh commands: vernacular-validation-and-qa.
- Running the harness, storybook, or the release machinery: vernacular-run-and-operate.
- Starting a fresh campaign against a new rendering defect: vernacular-rendering-defect-campaign.
- ADR authoring and numbering procedure: vernacular-docs-and-writing.

## Quick reference

| #   | Saga                                | Status as of 2026-07-05                      | Settled rule or anchor                                                                                                          |
| --- | ----------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Z-fighting at shared datums         | Settled                                      | New coincident surface joins the ordered depth-bias ladder; never invent a private epsilon (ADR-0133, ADR-0141)                 |
| 2   | Cross-architecture visual baselines | Open, linux scene lane just landed           | Render a baseline family on the exact platform, arch, and backend that later diffs it (ADR-0117, ADR-0152)                      |
| 3   | Harness readiness flake             | Settled                                      | Screenshot only after `data-harness-ready="true"`; async render resources must join the readiness contract (ADR-0149, ADR-0151) |
| 4   | Near-wall fade reversals            | Settled                                      | Fade is orbit-only, gated by camera-outside-building, user-controlled via the Reveal interior toggle (ADR-0086)                 |
| 5   | ADR numbering collisions            | Recurring; two duplicate pairs still on disk | `ls docs/knowledge/decisions` before assigning a number; pre-assign for parallel lanes                                          |
| 6   | ADR supersession graph              | Reference                                    | Frontmatter `status:` lies for partial supersessions; read the Status prose (see chronicle)                                     |
| 7   | Walk-mode collision                 | Settled                                      | Swept sub-steps of at most one walker radius plus a half-thickness standoff (ADR-0135)                                          |
| 8   | Release-gate scars                  | Reference                                    | Release-As is a one-shot override, drop it after use; resync the release branch to re-run the merge gate                        |
| 9   | Issue #457 postmortem               | Settled                                      | Measure the canvas client size before blaming the GPU or the environment                                                        |

## The sagas, condensed

Each entry here is the short form. The chronicle file has the full commit tables, verified against `main` on 2026-07-05.

### 1. Z-fighting at shared datums (ADR-0102, 0129, 0133, 0134, 0141, 0150)

Symptom: shimmer where surfaces are coincident by design (wall base on slab top at Y = 0, slab top on lawn, sash on window reveal, furniture base on floor, adjacent slab side faces on a shared wall centerline plane).
Root cause: the depth buffer cannot order faces that occupy the same plane; six incidents over four weeks each surfaced a new coincident pair.
Resolution: an ordered depth-bias ladder (front to back: wall base unbiased, then slab top, then ground plane; ADR-0141 chains window reveal and furniture base onto the end), each rung's `polygonOffset` derived from the previous rung's constant so the sequence is strictly increasing by construction. Geometry-side fixes complement it: slab interior edges stop at the wall centerline (ADR-0129), polygon-offset corners snap to a sub-micrometer grid (ADR-0134), and slab side faces step off the shared centerline plane (ADR-0150).
Rule: a new surface landing on an existing datum joins the ladder as a derived rung. Do not move geometry off its spec datum and do not add an isolated bias constant.

### 2. Cross-architecture visual baselines (open)

Symptom: pixel baselines rendered on one platform or architecture fail, or silently never run, on another.
Root causes, in the order they were learned: arm64 and amd64 chromium produce different pixels for the same page; amd64 chromium cannot launch under qemu on an arm64 Mac; the scene tier needs a GPU that CI runners lack; SwiftShader (chromium's built-in CPU rasterizer) renders WebGL2 deterministically but does not match Metal pixels.
Timeline: per-platform skip-when-missing in the app tier; story diff made advisory (PR #323) then re-gated after baselines were re-rendered on the amd64 runner itself (PR #338, merged 2026-06-24, ADR-0117); a WebGL2 probe proved ubuntu SwiftShader renders the harness byte-identically across launches (PR #461, merged 2026-07-04, issue #401); a linux scene lane landed with a `-linux` SwiftShader family beside the `-darwin` Metal family (PR #478, merged 2026-07-05, ADR-0152).
Status as of 2026-07-05: open. The `-darwin` scene family remains a development-Mac render with no CI gate of its own, the live-view WebGPU specs still skip on runners, and the app-visual tier has only `-darwin` baselines committed, so it is dormant on linux CI. The linux scene lane is newly landed; treat its behavior as unproven until a few CI runs confirm it.
Rule: one baseline family per rendering stack. Render it on the machine class that diffs it. Never diff across arch or backend and trust a tolerance to absorb the gap; that was tried and reverted.

### 3. Harness readiness flake (ADR-0149, ADR-0151)

Symptom: deterministic-harness screenshots intermittently missing the sky or under-lit; solar baselines captured a pre-sky frame.
Root cause: the harness captured its frame on mount while sky attach (and later ambient-occlusion accumulation) settled asynchronously.
Resolution: `LightingProvider.whenReady()` plus a second "ready" frame advertised as `data-harness-ready="true"`; specs await the attribute, never sleep or poll pixels (PR #458). The ambient-occlusion pass joined the same gate before its baselines landed (PR #474).
Rule: any new asynchronous render resource must join the readiness contract before its baselines are trusted. A spec that sleeps instead of awaiting readiness is a bug.

### 4. Near-wall fade reversal chain (ADR-0086, 0087, 0103, 0140, 0145)

Symptom sequence: exterior walls hid the interior (issue #122); the fade added to fix that glitched in walk mode; then it fired while the camera was inside the building; then users needed to turn it off.
Resolution after three reversals: fade runs in orbit mode only, additionally gated on the camera being outside the building footprint, and exposed as a "Reveal interior" toolbar toggle, default on. Openings, junction fills, and wall-attached furniture enroll as coordinated fade members so a fading wall does not leave its parts behind.
Status: settled for the framed preview. The live-view reconciler path does not enroll opening fills or attached furniture (issue #437, open as of 2026-07-05).
Rule: fade membership is a coordinated set; a new scene element type near an exterior wall must enroll explicitly.

### 5. ADR numbering collisions (recurring)

Eight renumber incidents are on main (0051, 0056, 0057, 0070, 0127, 0131, 0132, and the 0142/0143 pair renumbered after a 0141 collision). Two collisions were never resolved and sit on disk today: two ADR-0076 files (floor-slab-under-walls and wordmark-typeface) and two ADR-0081 files (opening-fill and canvas-design-tokens). Numbers 0002, 0008 through 0011, and 0013 through 0015 have no file at all, yet 0002, 0009, 0010, 0011, 0013, 0014, and 0015 are cited by `.claude/rules.md`, `ARCHITECTURE.md`, `.npmrc`, ADR-0016, and a plan file.
Rules: refer to a duplicated ADR by its full slug, never by bare number. Never create a file that reuses a missing or duplicated number without owner sign-off. Before assigning a new number: `ls docs/knowledge/decisions/ | tail -5`, and when running parallel lanes pre-assign numbers at dispatch (see vernacular-parallel-delivery).

### 6. The ADR supersession graph

Full and partial supersessions, verified in the ADR prose: 0055 to 0060 (buffered polyline drawing replaced by immediate commit; the only one whose frontmatter says `superseded`), 0077 to 0080 (junction miter generalized; 0077 still says `current`), 0031 partially to 0099 (y-down rendering note only; the projection model stands), 0048 partially to 0056 (the 2D paint-rendering deferral), 0065 partially to 0142 (tone-mapping reasoning), 0012 to 0017 (the boundaries lint config was "a no-op for the wrong reason"). Two ADRs reverse their own plans in-flight: 0139 corrects the foundation spec's y-down and winding text (the 3D view rendered as a mirror of the plan), and 0143 reverses both its timezone placement and its required-array plan choice.
Rule: frontmatter `status:` is unreliable for partial supersessions. Read the Status section prose of both ADRs before citing either.

### 7. Walk-mode collision (ADR-0135) and the crash-recovery branch duplicates

Walk: fast moves tunneled through walls, and the walker hugged the wall centerline instead of its face. Fixed by sweeping the move path in sub-steps no longer than the walker radius and standing off by `radius + thickness / 2`.
Crash recovery: shipped once, as OPFS write-ahead snapshots (ADR-0119, PR #331). Two local branches, `fix/wire-crash-recovery-production` and `fix/durable-recent-projects`, are abandoned duplicates of that wiring. Their content is already on main via PR #331 and the app-shell save wiring. Never merge, rebase, or mine them for "missing" work.

### 8. Release-gate scars

Three durable lessons from the release-please machinery, all evidenced on main: (a) the first release needed an explicit `Release-As` bootstrap, and the override was deliberately dropped the moment v0.1.0 shipped, because a lingering override pins every future version; (b) v0.3.0 had to be re-forced with a `Release-As: 0.3.0` commit footer after history rewrites desynced the tag audit and release-please inferred a patch bump; (c) a stale release PR clears its required `ci-complete` gate only after a synchronize push to the release branch. Also: `backup/*` branches hold pre-rewrite history; a SHA that resolves only there is dead history, never cite it.

### 9. Issue #457 postmortem: a layout bug dressed as environment drift

Symptom: the scene-live-view spec failed with the canvas stuck at the React Three Fiber mount default of 300x150 while 23 sibling scene specs passed. It failed identically at current main, pre-merge main, and the v0.3.0 tag, which read as proof of environment drift (a Chrome or macOS update).
Root cause: `SplitBody` in `editor/viewport/view-mode-viewport.tsx` set the inline `flex-basis` on only one pane, so the preview pane got roughly 19 percent of the row since the original splitter commit (2026-06-11). The bug stayed latent until the scene nav toolbar grew tall enough to consume the whole column, collapsing the camera pane to zero height. The WebGPU context initialized fine inside a 0-height pane.
Fix: complementary flex-basis on the preview pane (PR #459, merged 2026-07-04). A real user-facing fix, not a test accommodation.
Lessons: "fails at every old revision" fits a latent bug crossed with a slowly growing input just as well as environment drift; before blaming the GPU stack, measure the canvas client size and walk its ancestor boxes. The triage steps live in vernacular-debugging-playbook.

## Stale committed docs (do not trust these claims)

| Doc and claim                          | Reality as of 2026-07-05         | Check                   |
| -------------------------------------- | -------------------------------- | ----------------------- |
| ADR-0077 frontmatter `status: current` | ADR-0080 is its stated successor | ADR-0080 Status section |

When a task touches one of these, state current reality and flag the stale doc; do not repeat the doc.

## Common mistakes

- Fixing new z-fighting with a fresh standalone `polygonOffset` constant instead of a derived ladder rung, or by nudging geometry off its spec datum.
- Regenerating a baseline family on the wrong stack: docker on an arm64 Mac for the `-linux` story or scene families, or a linux run for `-darwin` scene files.
- Adding a sleep or a pixel poll to a scene spec instead of awaiting `data-harness-ready`.
- Trusting `status: current` in ADR frontmatter when a successor ADR partially supersedes it.
- Referring to ADR-0076 or ADR-0081 by bare number (each has two files), or "fixing" a citation of a missing number (0002, 0008-0011, 0013-0015) by pointing it at a neighbor.
- Citing a SHA that only resolves on a `backup/*` branch.
- Reviving `fix/wire-crash-recovery-production` or `fix/durable-recent-projects`; they are superseded duplicates.
- Concluding "environment drift" because a failure reproduces at old tags, without first measuring layout.

## Provenance and maintenance

All facts verified against the repo and GitHub on 2026-07-05. Every SHA cited here and in the chronicle was resolved with `git show` on `main` that day. Re-verify before relying:

- Saga anchor commits still on main: `git log --oneline main --grep="depth bias\|centerline\|readiness\|walk collision" -i | head -20`
- Duplicate and missing ADR numbers: `ls docs/knowledge/decisions/ | grep -E "0076|0081"` and `ls docs/knowledge/decisions/ | grep -E "0002|0008|0009|0010|0011|0013|0014|0015"`
- Linux scene lane state (was newly merged 2026-07-05): `gh pr view 478 --json state,mergedAt` and `ls e2e/tests/scene-visual-regression.spec.ts-snapshots/ | grep linux`
- App-visual tier still darwin-only: `ls e2e/tests/visual-regression.spec.ts-snapshots/`
- Crash-recovery duplicate branches still unmerged: `git branch --list "fix/wire-crash-recovery-production" "fix/durable-recent-projects"` and `git log --oneline main..fix/wire-crash-recovery-production | head -3`
- Live-view fade enrollment gap still open: `gh issue view 437 --json state`
- Supersession statuses: `grep -H "^status:" docs/knowledge/decisions/ADR-0055-* docs/knowledge/decisions/ADR-0077-*`
