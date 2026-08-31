# Rendering realism: visual gates, occlusion correctness, and wall coverings (campaign specification)

> Status: draft for review. Date: 2026-08-31. Author: Dan Moore.
> Relationship to prior design: continues the realistic environmental lighting epic
> (`docs/specs/2026-07-01-realistic-environmental-lighting.md`, ADR-0130) after its spine
> shipped, and picks up the finishes epic (#208) after the floor slice (#377) proved the
> material-treatment seam. Scoped to the public-beta milestone; no 1.0 item moves forward.

## Mission

Close the measurement gaps the lighting spine left behind, then land two realism
upgrades on top of the new gates: physically correct ambient occlusion and interior wall
coverings. The ordering rule for the whole campaign: no engine slice starts before the
gate that can judge it is on main. The rule exists because a no-op ambient-occlusion pass
once shipped and stayed green for its whole life; no committed pixel test could see it
(found during the radius recalibration, #519).

## Scope

In scope:

- Three visual gates: a targeted ambient-occlusion assertion (#522), a glossy harness
  surface with a specular assertion (#541), and a first live-view visual-regression spec on
  the WebGPU path (#469).
- The ambient-occlusion upgrade pair: an indirect-only occlusion blend (#470) and normals
  from a dedicated render target (#471), on top of a three.js bump to 0.185.0.
- Interior wall coverings (#378), scoped to flat coverings such as wallpaper on the
  room-facing `wall-face` surface.

Out of scope, parked with revival conditions in the deferrals section: color fidelity
against a physical reference (#504), night and dusk skies (#446), the sun-path overlay
(#445), site surroundings (#447), exterior cladding (#379), modeled wall features such as
paneling and wainscot (#364), real furniture geometry (#221), and the grass ground texture
(#409).

## Locked decisions

Six forks were settled in the brainstorm that produced this spec.

1. **Public-beta realism only.** Every slice serves the public-beta milestone. No item
   moves out of the 1.0 milestone into this campaign.
2. **Gates before engine work.** Slice A lands all three gates before slice B or C starts.
   The live-view spec (#469) rides in slice A because it watches the backend the users
   actually see, and it would have caught the view-mode session defect (#603).
3. **Bump three.js and take both occlusion refinements.** three.js 0.185.0 was published on 2026-06-25 and has cleared the 30-day dependency cooldown. The bump carries the r185
   GTAONode parameter changes, so the retune happens once, judged by the new gate.
4. **Coverings are finishes; paneling is a feature.** A wall covering (wallpaper) is a
   non-solid `SurfaceTreatment` on the `wall-face` surface. Paneling, beadboard, and
   wainscot remain modeled wall features under #364. The two do not overlap, so nothing is
   represented twice. ADR-0172 records the split.
5. **Color fidelity stays parked.** The physical swatch readings for #504 do not exist
   yet. The spike revives when the owner supplies them.
6. **Tolerances are derived, then frozen.** Every new assertion threshold is placed
   between a passing probe and a failing probe, with a margin of at least twice the observed
   noise band over five repeated captures, and the derivation is recorded next to the
   constant. This is the rule that produced the 0.06 color-accuracy tolerance (ADR-0157).

## Slice A: the three gates

Three small, test-only slices. None changes render behavior; existing baselines must not
move. Only new canonical states, new assertions, and new baseline images land.

### A1: targeted ambient-occlusion gate (#522)

The whole-frame tolerance (0.35 per pixel, 0.05 differing-pixel ratio) absorbed a probe
with a deliberately wrong 10x radius. The gate becomes a targeted contrast assertion in the
style of `scene-color-accuracy.spec.ts`: sample a crop at a wall-floor junction and a crop
on the open wall above it in the ambient-occlusion canonical state, and assert a minimum
occlusion contrast between them.

Acceptance:

- With the shipped 250 mm radius (`AO_RADIUS_METERS = 0.25`), the assertion passes.
- With a 2500 mm radius probe, the assertion fails.
- The threshold follows the derivation rule in locked decision 6.
- All existing scene and story baselines are byte-identical.

### A2: glossy harness surface (#541)

A new canonical state places a semi-gloss floor next to a matte one, driven through
`finishId` and the existing physical material path. A targeted assertion requires the two
surfaces to sample distinctly.

Acceptance:

- The glossy and matte samples differ by at least the derived minimum delta (locked
  decision 6), and erasing the specular difference (the #520 defect class) fails the gate.
- Only new baseline images land; existing baselines are byte-identical.

### A3: live-view visual regression on WebGPU (#469)

A first pixel spec renders the real live view, not the harness, on the WebGPU backend: the
harness fixture project, a fixed camera preset, and a committed `-darwin` baseline. The
spec runs on the development Mac tier and self-skips where WebGPU is unavailable, so the CI
SwiftShader lane keeps its WebGL 2 contract (ADR-0152). Capture waits on a live-view
readiness signal, the analog of `data-harness-ready`, exposed through the scene-session
provider (ADR-0170); no capture may rest on a timeout.

Acceptance:

- The spec passes locally on the development Mac at the shell tolerances (0.35 per pixel,
  0.05 differing-pixel ratio) across five consecutive runs.
- On a machine without WebGPU the spec reports a skip, not a failure.
- A deliberate render change (for example, disabling the occlusion pass) fails the spec.

## Slice B: the ambient-occlusion upgrade

One sequential engine lane, started only after slice A is on main. Stages, in order:

1. **Bump three.js to 0.185.0.** The bump is its own commit set. Every moved scene or
   story baseline is inspected and accounted for before the next stage; the A1 gate must be
   green after the GTAONode retune, with retuned values and their derivation recorded in
   `engine/postprocessing/ambient-occlusion-params.ts`.
2. **Indirect-only blend (#470).** The pass stops multiplying occlusion across the whole
   frame and applies it to the indirect light contribution only, through the second
   render-target channel ADR-0151 deferred. Acceptance: the A1 junction contrast still
   passes, and a direct-lit sample reads brighter than under the full-frame multiply by at
   least the observed noise band.
3. **Dedicated normal target (#471).** The pass supplies real normals instead of
   depth reconstruction. Both prerequisites named in the issue now hold: three fixed the
   multiple-render-target divergence at r174, and the A3 spec watches the WebGPU path.
   Acceptance: A1 and A3 both green; the frame budget (60 fps interactive on integrated
   graphics, inherited from the GTAO spec) still holds.
4. **ADR-0171** amends ADR-0151: it reverses locked decisions 2 (depth-reconstructed
   normals) and 3 (whole-frame multiply) and updates the backend-parity posture now that a
   live-view WebGPU spec exists. The corresponding edit to
   `docs/specs/2026-07-04-gtao-ambient-occlusion.md` rides under it, in the same pull
   request.

If the retune cannot restore the A1 margin, or A3 exposes a backend divergence, the lane
stops and the finding becomes an issue. Gate thresholds do not loosen to admit a slice.

## Slice C: interior wall coverings

One lane across `core/`, `engine/`, and `editor/`, started once A2 is on main. It may run
in parallel with slice B under the file fence in the delivery section.

- **Data model.** A covering is a non-solid `SurfaceTreatment` variant on the room-facing
  `wall-face` `SurfaceRef`, reusing the seam the floor slice proved. A wall-coverings
  registry follows the ADR-0006 pattern beside `core/registries/floor-patterns.ts`.
  Texture assets are content-addressed. A schema migration beside
  `add-surface-treatment.ts` carries old documents forward.
- **Rendering.** The 3D wall face receives the covering through
  `engine/materials/physical-material-provider.ts`; the 2D plan wall band mirrors the
  floor-pattern treatment; the paint panel exposes the covering per wall face.
- **ADR-0172** records the coverings-versus-features split (locked decision 4) and the
  registry shape, in the same pull request.

Acceptance:

- A new canonical state shows one papered wall beside one painted wall. The covering's
  base color reads within 0.06 of its registry reference under the color-accuracy sampling
  method, and the papered wall's sheen differs from semi-gloss paint by at least the A2
  delta.
- An old document without coverings loads, and a document with a covering survives a save
  and load round trip, proven by a migration test.
- `core/` still imports neither React nor Three.js (boundaries lint green).
- Registry entries carry licenses that pass the pack license policy.

## Testing and verification

Every slice ships through the red-green-blue cycle with the usual gates (typecheck, lint,
format, unit, e2e, build) and `pnpm rgb:audit --range origin/main..HEAD`. New tolerances
follow locked decision 6 and are frozen in named constants with their derivation in a
comment. Slice A is the evidence bar for slices B and C: a reviewer can point at the gate
that judges each engine change.

## Knowledge and Architecture Decision Records

ADR-0171 (slice B, amends ADR-0151) and ADR-0172 (slice C, records the #364 split) are
pre-assigned to avoid parallel-lane collisions and re-verified against main at dispatch.
Slice A carries no ADR: it extends the committed test posture without changing a decision.
On landing, the epic ledgers are swept: #451 gains the occlusion entries, and #208 gets its
stale #377 checkbox ticked.

## Delivery

Five worktree lanes under the sibling worktree convention:

1. A1, A2, and A3 run in parallel and merge in that order. Each lane owns its new spec
   file and its new baselines, plus additive edits to the shared harness state list where
   its canonical state lives; the merge order resolves overlaps there.
2. B runs alone after slice A merges. It owns `package.json`, the lockfile,
   `engine/postprocessing/`, and the baseline sweep.
3. C starts once A2 is on main and may run beside B. It owns the paint and materials
   seams (`core/registries/`, `core/paint/`, `core/migrations/`, `core/model/`,
   `engine/materials/`, `editor/paint/`) plus its own new state and spec, and must not
   touch `package.json`, the lockfile, or `engine/postprocessing/`.

No lane touches `editor/design-system/**` or `.storybook/**`. Resolve merge conflicts by the stated ownership.

## Open questions and risks

- The exact r185 GTAONode parameter changes are unknown until the bump lands. If the
  retune cannot restore the A1 margin, the lane stops (slice B rule above).
- WebGPU availability in headless capture on the development Mac is assumed, not yet
  proven. If the live view cannot capture deterministically on WebGPU, A3 falls back to
  filing what it learned and the campaign proceeds gated by A1 and A2 alone.
- The starter covering set (which patterns, from which openly licensed sources) is decided
  at plan time. Default: a small set of period-plausible papers that pass the pack license
  policy.
- Plan-scale legibility of coverings on the 2D wall band is unproven. Default: mirror the
  floor-pattern treatment and revisit if the band turns illegible at common zoom levels.
- How a covering composes with a future modeled feature (wainscot over wallpaper) is
  deliberately unresolved until #364 settles its feature model.

## Deferrals

| Item                                   | Fate   | Revival condition                                    |
| -------------------------------------- | ------ | ---------------------------------------------------- |
| #504 color fidelity vs physical swatch | Parked | The owner supplies the physical swatch readings      |
| #446 night and dusk skies              | Parked | 1.0 milestone work begins                            |
| #445 sun-path overlay                  | Parked | 1.0 milestone work begins                            |
| #447 site surroundings as lighting     | Parked | 1.0 milestone work begins                            |
| #379 exterior cladding finishes        | Parked | This campaign's covering seam ships and #364 settles |
| #364 paneling and wall features        | Parked | Owner triage of the vocabulary feature model         |
| #221 real furniture geometry           | Parked | Unchanged; large-asset pipeline priorities           |
| #409 grass ground texture              | Parked | A demo or milestone needs an exterior ground surface |
