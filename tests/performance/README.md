# Performance count gates

These tests keep a record of how much work the plan view and the 3D view do for one fixed
project. They compare counts, not times, so they give the same result on every machine and a
failure always means the code changed. The design is in ADR-0186 and in section 5.6 of
`docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md`.

## The reference project

`createReferenceProject()` in `reference-project.ts` builds one project. It uses no randomness
and no clock, its ids are fixed, and its app version is `0.0.0`, so every call returns the same
document. The numbers below are in `baseline-sizes.json`, which `reference-project.test.ts`
checks against the generator:

| Floors | Walls | Rooms | Openings | Stairs | Furniture | Painted surfaces | Dimensions |
| -----: | ----: | ----: | -------: | -----: | --------: | ---------------: | ---------: |
|      4 |   108 |    40 |       44 |      6 |       200 |              116 |         16 |

Rooms are the ones derived from the walls. Openings and stairs together are the 50
architectural elements that section 6.10 of the design specification asks for.

## What is counted

Both counts are defined by what can be observed, so they stay valid if the code behind them is
replaced.

1. Plan draw operations. For each floor, `drawPlan` draws once into the recording drawing
   context. The count is the number of calls the context received, in total and by method name.
   The viewport is the one that fits the floor, and the grid and the dimensions are on. The
   rulers and the room labels have no switch and are always drawn. The result is stored in
   `baseline-plan-draw.json`. Every floor must also draw something, with `fillText` and
   `stroke` among the methods, and a floor drawn with the dimensions off must make fewer calls
   than with them on. These checks run in an update run too, so an empty draw is never recorded.
2. 3D groups changed per edit. The project is reconciled into a framed scene, one of six
   edits is applied with its real command through an editor session, and the project is
   reconciled again with the same reconciler. For each kind of group (floor, wall group, room,
   opening, and furniture) the test records three numbers:
   - `rebuilt`: the element id is there before and after, and its group is a different object.
   - `removed`: the element id was there before the edit and is gone after it.
   - `added`: the element id is new after the edit.

   The edits are `move-wall-endpoint`, `move-furniture`, `resize-opening`, `paint-surface`,
   `set-ceiling-height`, and `rename-project`, which must rebuild, remove, and add nothing. The
   result is stored in `baseline-scene-rebuild.json`.

The comparison is exact equality with the baseline files. There is no tolerance.

The counts move with the text and length of a label, the font defaults, the grid spacing, the fit
padding, the wall join rules, and any new drawing pass, so a change to any of these can need a new
baseline.

## Running the tests

```sh
pnpm exec vitest run --project unit tests/performance
```

To record a new baseline, run the same command with `UPDATE_PERFORMANCE_BASELINE=1` set. That
rewrites `baseline-plan-draw.json` and `baseline-scene-rebuild.json`. Each test file writes only
its own file, so the test files can run in parallel and no write loses another one. The sizes in
`baseline-sizes.json` are only checked, never written. Run the tests again without the variable
to confirm they pass, then read the diff of the files. CI never sets the variable.

## Changing a count

A pull request that changes a count updates the baseline file in the same pull request and says
why in its description. That holds for a lower count as much as a higher one. A lower count is a
change in behavior, and if the new number is not recorded, the next regression hides behind the
old one. A failed gate prints these steps in its message.

## Times

Times in a real browser are not part of these tests and no CI job measures them. A separate
local command reports them, and a later pull request adds it.
