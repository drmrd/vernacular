# Rendering realism: gates first, then slices

- Date: 2026-09-06
- Status: accepted
- Decided with the owner in the brainstorm of 2026-09-01 through 2026-09-06.

## Context

The realistic-lighting spine shipped through PR #511 with a colour-accuracy gate at
tolerance 0.06 (ADR-0130, ADR-0157). The GTAO ambient-occlusion pass runs under a
CI-gated linux lane (ADR-0151, ADR-0152). Since ADR-0170 the live 3D view keeps its
session state across view-mode switches, so a viewer can compare lighting states
without losing the camera.

Further engine work is hard to judge because three gates are missing:

- Scene baselines do not gate ambient-occlusion tuning (#522). A GTAO change can
  drift the picture and still pass CI.
- The scene harness has no glossy surface (#541). Specular rendering is not
  pixel-tested at all.
- Only the deterministic harness is pixel-tested. The live view has no
  visual-regression spec (#469), which is why the session-state defect fixed by
  #603 reached main unseen.

The delivery rule from the lighting epic still applies: no engine lane starts
without the gate that can judge it.

## Decision

Land the three gates first, then spend them on the ambient-occlusion pair and one
visible exterior win. Six lanes run in strict sequence. Each lane is a small pull
request off main that merges before the next lane branches.

### Lane 1: glossy harness surface (#541)

Add one specular surface to the deterministic scene harness fixture and seed its
scene baselines through the refresh workflow after merge. Acceptance evidence: a
named baseline set that includes the glossy surface, and a seeded roughness defect
that turns the scene-visual job red.

### Lane 2: ambient-occlusion baseline gate (#522)

Add a harness scene state that emphasises contact occlusion, and baseline it, so a
GTAO change fails the scene-visual job on drift instead of passing unseen.
Acceptance evidence: a baseline set for the occlusion state, a tolerance derived
from measured cross-platform noise rather than picked by hand, and a seeded GTAO
parameter change that turns the job red.

### Lane 3: live-view visual regression (#469)

Add a Playwright spec that pixel-tests the live 3D pane on its real render path,
keyed on the readiness attribute the session provider already advertises.
Acceptance evidence: a live-view baseline set, and a seeded reconciler defect that
the spec catches while the harness specs stay green. This lane adds a CI render
lane, so it documents its run cost in its ADR.

### Lane 4: indirect-only ambient-occlusion blend (#470)

Apply ambient occlusion to indirect light only, which is the physically correct
blend. The lane 2 gate judges the change; the lane updates the occlusion baselines
deliberately and records the before and after captures in the pull request.

### Lane 5: ambient-occlusion normals from a dedicated render target (#471)

Feed GTAO from a dedicated normals target instead of reconstructing normals from
depth. Same gate, same baseline discipline as lane 4.

### Lane 6: grass ground plane (#409)

Replace the flat ground colour with a content-addressed grass texture through the
asset pipeline. Exterior baselines refresh once, deliberately, when it lands.

## Process constraints

Each lane runs in a sibling worktree with the red-green-blue cycle and scope-fenced
briefs, passes the clean-code review and the pull-request review before it opens,
and merges before the next lane branches. Scene baselines refresh on main after
every merge that changes pixels. The ambient-occlusion lanes extend ADR-0151; lane
3 gets its own ADR because it changes the CI lane shape.

## Deferred

The sun-path overlay (#445), the night sky (#446), site context (#447), interior
and exterior finishes (#378, #379), and real furniture geometry (#221) all wait
until the gates exist. The colour-fidelity spike (#504) inserts after lane 3 as
soon as the owner's physical swatch readings exist; as of this writing they do
not.
