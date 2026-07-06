---
name: vernacular-research-methodology
description: Use when turning a hunch, bug report, or feature idea into an accepted result in this repo. Triggers, judging whether evidence proves a mechanism, writing a root cause or postmortem, capturing raw observations, preparing a brainstorm or decision, scoping a spec or plan, parking or deferring an idea, or setting tolerances and budgets before an experiment. Keywords, hypothesis, evidence bar, negative observation, postmortem, triage, deferral, tracking issue, retire or resurrect.
---

# Vernacular research methodology

## Overview

An idea earns code only by walking a fixed lifecycle: capture, triage and brainstorm, spec, plan, red-green-blue implementation, ADR on landing, ledger for what remains. A mechanism earns belief only when one mechanism explains every observation made, including the negative ones, and its predictions for observations not yet made were written down and then checked.

## When to use

- Deciding whether an investigation's conclusion is proven, or reviewing someone else's proposed root cause.
- Writing a root-cause comment or postmortem.
- You hold a raw observation (a bug you just saw, an idea you just had) and are tempted to go straight to code.
- Scoping a spec or plan and writing its acceptance criteria.
- Cutting scope, deferring a slice, or parking an idea for later.

## When NOT to use

| Need                                                          | Use instead                           |
| ------------------------------------------------------------- | ------------------------------------- |
| Campaign method for 3D rendering pixel defects                | vernacular-rendering-defect-campaign  |
| Picking which frontier topic to pursue next                   | vernacular-research-frontier          |
| Mechanics of the red-green-blue cycle, gates, review dispatch | vernacular-change-control             |
| Symptom-to-cause triage for known failure modes               | vernacular-debugging-playbook         |
| ADR, spec, and plan formats and house language                | vernacular-docs-and-writing           |
| What counts as test evidence, baseline tiers                  | vernacular-validation-and-qa          |
| Worked prove-it analysis recipes                              | vernacular-proof-and-analysis-toolkit |
| What was already investigated and settled                     | vernacular-failure-archaeology        |

## Quick reference

| Lifecycle stage       | Artifact                                                                        | Real example (verified 2026-07-05)                                |
| --------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Capture               | GitHub issue, or draft note in `issue-notes/`                                   | issue #457, filed 2026-07-04 from a live failure observation      |
| Triage and brainstorm | Decision packet with A/B/C forks, or an evaluation ADR                          | ADR-0097 (DCEL evaluation); ADR-0098 (sidebar keep-or-remove)     |
| Spec                  | `docs/specs/YYYY-MM-DD-<name>.md`, per-slice acceptance, open-questions section | `docs/specs/2026-07-01-realistic-environmental-lighting.md`       |
| Plan                  | `docs/plans/YYYY-MM-DD-<name>.md`, one plan per slice, cycles enumerated        | `docs/plans/2026-07-01-realistic-lighting-slice-0-foundations.md` |
| Implement             | Red-green-blue commit cycles, audited by `pnpm rgb:audit`                       | see vernacular-change-control                                     |
| Record                | ADR in `docs/knowledge/decisions/`, landed in the same PR                       | ADR-0151 landed with PR #474                                      |
| Ledger                | Epic tracking issue: checkbox spine plus parked list                            | issue #451                                                        |

The full lifecycle traced through one real epic, artifact by artifact: [references/lighting-epic-lifecycle.md](references/lighting-epic-lifecycle.md).

## The idea lifecycle

### 1. Capture: observations land as notes or issues, never as code changes

Raw observations (a rendering glitch, a missing capability, a suspicious flake) get written down first. Two capture surfaces exist:

- GitHub issues: the durable home. File one when the observation is clear enough to state.
- `issue-notes/`: draft bug notes with YAML frontmatter (`status: draft`, `github: null`, `possible_duplicate_of`). As of 2026-07-05 this directory holds 13 unfiled drafts and is untracked working state, not committed truth. Drafts get hydrated into issues at triage.

Do not fix from a raw observation. A fix without an issue has no argued mechanism and gives review nothing to check against.

### 2. Triage and brainstorm: decision prep before any plan

Open-ended work gets a decision-prep pass before anyone plans anything. The committed exemplars are the evaluation ADRs: ADR-0097 (evaluate a doubly connected edge list) and ADR-0098 (keep or remove the sidebar section) each research the current code state with file and line evidence, frame the fork as concrete choices with a recommended default, and change zero source code. Epic-scale work takes the same prep as a brainstorm packet with A/B/C forks; the packets under `docs/brainstorm-prep/` exist only on the owner's machine (untracked, absent from any fresh clone, worktree, or CI checkout), so never cite them from a committed document. The real specs and ADRs come out of the brainstorm, not the packet.

### 3. Spec: a dated document with numbers in the acceptance criteria

Open-ended changes produce `docs/specs/YYYY-MM-DD-<short-name>.md`. Requirements for a spec that will survive contact:

- Every slice has an Acceptance list, and the acceptance criteria carry numbers or named gates, not adjectives. Example: the lighting spec's slice-3 gate, a known paint color "reads within a stated tolerance of its reference swatch".
- An "Open questions and risks" section declares the unknowns instead of hiding them (`docs/specs/2026-07-01-realistic-environmental-lighting.md` has one; each entry later gets an owner or a parked-list slot).
- A landed spec is never edited without an ADR recording why (repo rule; see the "Things never to do" list in `CLAUDE.md`).

### 4. Plan: slice decomposition

Each spec decomposes into slices, each independently visible and testable, each with its own plan file. The lighting epic shipped as slice 0 (foundations), 1a (solar provider), 1b (environment panel), a re-scoped sky slice, and an ambient-occlusion slice, five plan files dated 2026-07-01 through 2026-07-04. Plans enumerate red-green-blue cycles (one behavior equals one test, feat, refactor triple). Mid-flight corrections are appended to the plan header, not silently rewritten (the slice-0 plan opens with a correction block re-mapping ADR numbers claimed by concurrent branches).

### 5. Implement: red-green-blue slices

Implementation follows the role-separated red-green-blue cycle; `pnpm rgb:audit` enforces the commit grammar. Mechanics, gates, and reviewer dispatch belong to vernacular-change-control; do not route around them.

### 6. ADR on landing

The ADR ships in the same PR as the change it records, not as a follow-up. Example: PR #474 (ambient occlusion) carries both the feature commits and `docs: record ADR-0151 for the ambient-occlusion render pipeline`.

### 7. Ledger: the retire-or-resurrect pattern

The epic tracking issue is the ledger. Issue #451 (realistic lighting) shows the full shape:

- A checkbox spine: shipped slices checked with their PR and ADR numbers inline; remaining slices unchecked with owning issue numbers.
- An "alongside the spine" list and a "later layers" list: every deferred item is either a numbered issue (#445, #446, #447) or a named spec layer.
- An explicit parked list for old promises: #451 keeps "the retire-or-resurrect list from the older lighting records (named color-temperature presets, the color-temperature slider's meaning per mode, the WebGL2 feature-parity posture)".

Running the pattern: when an epic review or a slice landing surfaces an old promise or an open question, give it exactly one of three fates. Retire it formally (a sentence in the next ADR saying it is dropped and why). Resurrect it (file an issue stating the condition under which it becomes worth building). Or park it on the epic ledger with that condition written down. "We should someday" living only in prose is not a state.

## The evidence bar

One mechanism must explain ALL observations, including the negatives. The canonical counterexample is issue #457. Read it in full before writing any root-cause comment:

```
gh issue view 457 --comments
```

What happened: a scene live-view e2e spec started failing locally (canvas stuck at its 300x150 mount default). The issue body concluded the cause was "environmental rather than a code regression", resting on: the failure reproduced identically at three code versions including v0.3.0, the other 23 scene specs passed, and an earlier day of whole-project self-skips suggested the local GPU stack was shifting. The suggested next steps were all environment-shaped (pin the browser build, probe the device request).

The environment-drift hypothesis was accepted without making the observations it predicted: a device request that hangs or rejects, console errors, an unhealthy GPU init. When those observations were finally made, every one came back negative: the adapter and device resolved, the renderer initialized, the canvas held a live context with zero errors. Measuring the canvas's container found it 0 px tall. The real mechanism was a layout bug: `SplitBody` set an inline flex-basis on only one pane, the preview pane's share shrank, a toolbar that had grown across recent slices stacked past the column height, and the camera pane collapsed to zero. Fixed in PR #459 (merged 2026-07-04).

Why the layout mechanism wins the bar and the drift story never did:

| Observation                                        | Environment drift explains it?                                                | Layout bug explains it?                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Fails identically at v0.3.0 and current main       | Consistent but proves nothing (drift hits all versions; so does a latent bug) | Yes: the one-sided basis and the tall toolbar both predate the tag                |
| Other 23 scene specs pass on the same GPU stack    | Unexplained (drift should hit siblings)                                       | Yes: only this spec renders in the split view                                     |
| Canvas exactly 300x150                             | Unexplained (a dead GPU gives errors, not a default-size canvas)              | Yes: the mount default persists when the measured pane has no height              |
| Passes with only the viewport widened to 1920x1080 | Unexplained                                                                   | Yes: a wider window gives the starved pane enough height                          |
| Earlier whole-project self-skips (2026-07-03)      | Its only real support                                                         | Not explained; the postmortem explicitly fences it as a separate open observation |

That last row matters twice: the winning mechanism is allowed to leave an observation open, but only by saying so out loud and parking it. Silently absorbing it would have been a lie.

Root-cause checklist (apply before accepting any mechanism, yours or anyone's):

- [ ] State the candidate mechanism in one sentence naming a specific code path or component.
- [ ] List every observation so far, including the negatives: what did NOT fail, where it did NOT reproduce.
- [ ] State what your hypothesis predicts for the observations you did NOT make yet, then go make them. This is the #457 lesson.
- [ ] Check the mechanism against each observation. One unexplained observation means the mechanism is wrong or incomplete.
- [ ] List anything the mechanism does not cover and park it as its own open question.
- [ ] Remember: "old code fails too" does not prove "the environment changed". A latent bug crossing a slowly moving threshold produces the same signature.

## Numbers before running

Hypotheses predict numbers, and the numbers get written down before the experiment runs. If you cannot state the expected tolerance, budget, pixel ratio, or frame count in advance, you are not ready to run; running anyway produces an anchor-free tuning session. The lighting epic's end-to-end review flagged exactly this risk: with no written intensity and exposure convention, the materials slice would "tune materials against an arbitrary anchor"; a luminance-calibration ADR is owed before that slice is tuned (tracked in #449, open as of 2026-07-05).

Real examples of the practice, all written before the code they gate:

| Number                                           | Written down in                                                               | Value                                                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Frame-rate budget for the ambient-occlusion pass | `docs/specs/2026-07-04-gtao-ambient-occlusion.md`, Performance budget section | 60 fps interactive on integrated graphics (inherited from design spec section 6.10)                                            |
| AO sample count and ordered fallback ladder      | same spec                                                                     | start at the addon default (16); if the frame-time check fails, first lower the sample count, then a half-resolution AO buffer |
| Scene-tier pixel comparison bounds               | `e2e/tests/scene-visual-regression.spec.ts` constants                         | `SHELL_THRESHOLD = 0.35`, `SHELL_MAX_DIFF_PIXEL_RATIO = 0.05`                                                                  |
| App-tier screenshot tolerance                    | `playwright.config.ts`                                                        | `SCREENSHOT_DIFF_TOLERANCE = 0.02`                                                                                             |
| Harness frame count                              | ADR-0149                                                                      | exactly two frames: the mount frame and the ready frame                                                                        |
| Solar-position accuracy                          | lighting spec, slice 1a acceptance                                            | must match published reference values "within a stated tolerance" (the spec forces the number to exist before the test does)   |

The tolerance and baseline machinery itself (tiers, refresh commands) belongs to vernacular-validation-and-qa.

## Adversarial refutation

A proposed mechanism or design is not accepted on the proposer's say-so. Someone or something independent tries to break it first.

- Per diff and per branch: the clean-code-reviewer and pr-reviewer subagents audit every cycle and every branch (dispatch details in vernacular-change-control). This is the floor, not a formality.
- Per epic: after a spine of slices ships, a fresh end-to-end review re-reads the brainstorm, the spec, the ADRs, and the merged code, hunting for drift between what was decided and what was built. The lighting epic's review found the headline color-accuracy gate could be technically passed (a swatch under direct light) while missing the actual use case (a room lit by bounce). Consequence, visible in issue #451: the sky and ambient-occlusion slices joined the spine "because the headline gate tests an indirectly lit interior surface, and those two carry the indirect light".
- Conflicts resolve as recorded decisions, not silent edits: that same review recommended a tone-mapping operator that conflicted with landed ADR-0142. The resolution was ADR-0147 (per-mode tone mapping), an explicit amending record, landed with the implementing PR.

If you propose a mechanism and nobody has tried to refute it, route it through review before acting on it.

## Deferral discipline

Every scoped-down, cut, or deferred slice gets a tracking issue. Nothing silently vanishes.

Evidence the discipline is real: the lighting review's "issues to file" list became actual numbered issues, verified 2026-07-05:

| Deferred idea                                                | Issue | State                      |
| ------------------------------------------------------------ | ----- | -------------------------- |
| Sun-path and compass overlay                                 | #445  | open                       |
| Night scenes: moonlight, stars, dusk                         | #446  | open                       |
| Perceived-color readout                                      | #450  | open                       |
| Daylight through glass (spine slice 2)                       | #444  | open                       |
| Physically based materials and the color-accuracy gate       | #449  | open                       |
| Ambient occlusion (was a deferred spike, re-ranked to spine) | #442  | closed, shipped as PR #474 |

Rules:

- Cut scope during planning or implementation: file the tracking issue in the same session and link it from the plan's follow-up list.
- Every deferred idea ends in one of the three ledger fates (retire, resurrect, park with condition). See the ledger section above.
- When a slice lands, sweep the spec's open-questions section: each entry now has an owner, a ledger slot, or a written retirement.

## Where good ideas come from

Three sources have produced this project's real roadmap items. Check them before inventing work:

1. Owner bug notes from hands-on use: the `issue-notes/` drafts. Hydrate them into issues at triage; the frontmatter already carries proposed labels, related issues, and duplicate suspicions.
2. Corpus-driven gap analysis: `resources/floor-plans/` holds 37 numbered, openly licensed historic plans, committed to main. Each plan's `meta.json` records `gap_features` (slug plus why) and a `representabilityTier`; the README's "Gaps surfaced" column aggregates them. A gap slug recurring across many plans is a roadmap candidate with built-in evidence. ADR-0052 turns the corpus into the enforced definition of a valid floor plan (conformant fixtures), so the same artifact drives both testing and product gaps.
3. Epic end-to-end reviews: one adversarial re-read of a shipped spine produced the sky re-scope, the ambient-occlusion slice, and the entire deferral table above. Budget one such review per epic once its spine is half shipped.

## Common mistakes

- Fixing from a raw observation, skipping capture and triage. The fix lands with no argued mechanism and review has nothing to check it against.
- Accepting a mechanism because it explains the positive observations. The #457 drift story did exactly that; the negatives (23 passing siblings, an error-free canvas) were the tell.
- Treating "reproduces on old code" as proof the environment changed. It is equally the signature of a latent bug crossing a moving threshold.
- Writing tolerances after seeing the output. Numbers go in the spec or plan first; anything else is baseline laundering.
- Deferring by deletion: cutting scope in a plan revision with no tracking issue filed.
- Mistaking working notes for the record. `issue-notes/`, `docs/brainstorm-prep/`, and `docs/design-review/` are untracked local prep as of 2026-07-05. The record is specs, plans, ADRs, and GitHub issues.
- Editing a landed spec without an ADR.
- Parking an idea with no revival condition. A parked entry states when it becomes worth building, or it is just clutter.

## Provenance and maintenance

All facts verified 2026-07-05 against the working tree and GitHub. Re-verification one-liners:

- #457 postmortem text and root cause: `gh issue view 457 --comments`
- Fix PR merged: `gh pr view 459 --json state,mergedAt`
- Epic ledger shape and retire-or-resurrect list: `gh issue view 451`
- Deferral issue states: `for n in 442 444 445 446 449 450; do gh issue view $n --json number,state,title -q '[.number,.state,.title]|@tsv'; done`
- Lifecycle directories exist: `ls docs/specs docs/plans docs/knowledge/decisions issue-notes docs/brainstorm-prep 2>/dev/null`
- Capture drafts still unfiled (untracked): `git status --short issue-notes/ docs/brainstorm-prep/`
- Scene tolerances: `grep -n "SHELL_THRESHOLD\|SHELL_MAX_DIFF_PIXEL_RATIO" e2e/tests/scene-visual-regression.spec.ts`
- App tolerance: `grep -n "SCREENSHOT_DIFF_TOLERANCE" playwright.config.ts`
- GTAO budget and fallback ladder: `grep -n "budget\|sample count" docs/specs/2026-07-04-gtao-ambient-occlusion.md`
- Corpus gap machinery: `grep -n "gap_features\|representabilityTier" resources/floor-plans/CONVENTIONS.md`
- rgb audit script wired: `grep -n "rgb:audit" package.json`
- ADR-0147 and ADR-0151 exist: `ls docs/knowledge/decisions/ | grep -E "0147|0151"`

Volatile: issue and PR states, the untracked status of the capture directories, and the corpus plan count (37 as of 2026-07-05) will drift. The #457 postmortem, the merged PR numbers, and the committed spec and ADR texts are stable history.
