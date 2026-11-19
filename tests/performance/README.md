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

`pnpm perf:report` reports how long the plan redraw, the 3D update, and the 3D frame take for the
reference project, in a real browser. It reports times and never gates on them. No CI job runs it,
and a time never changes its exit code. The method is in ADR-0186.

### Running the command

```sh
pnpm perf:report
```

The command builds a production copy of a small timing page, then opens a Chromium window on your
screen and runs every measurement in it. How long a run takes is not known yet. The first visible
run will tell. For a run that means something:

- keep the window visible and in front from start to finish, not minimized or covered;
- use mains power, because battery power lowers clock speeds;
- close other applications;
- commit or discard changes to tracked files first, so the times belong to a commit.

To check that the command works at all, run `pnpm perf:report --quick`. It takes a tenth of the
samples, at least 10 in each phase, and marks the report "Quick check, not a measurement." Never
treat a quick run as a measurement.

### Flags

Paths are relative to the repository root.

| Flag                | Effect                                                                             |
| ------------------- | ---------------------------------------------------------------------------------- |
| `--out <path>`      | Write the run file to this path.                                                   |
| `--baseline <path>` | Compare with this run file instead of `tests/performance/baseline-times.json`.     |
| `--write-baseline`  | Also write the run as `tests/performance/baseline-times.json`. See "The baseline". |
| `--quick`           | Take a tenth of the samples. A check, not a measurement.                           |
| `--help`            | Print the usage and exit.                                                          |

Every run writes a run file and prints its path on a `Run file:` line. Without `--out` it goes to
`node_modules/.cache/performance-timing/`. A `--baseline` path that does not exist counts as no
baseline, so check the spelling when the report says "not measured".

To compare a branch with `main` on one machine, run the command twice, in the same conditions:

1. On `main`, run `pnpm perf:report --out main.json`.
2. On the branch, run `pnpm perf:report --baseline main.json`.

The second report shows the change beside each time. Leave `main.json` out of the commit.

### Reading the report

The report opens with header lines: `Commit` (with whether tracked files have uncommitted
changes), `Build`, `Machine`, `Browser`, `Adapter`, `Display` (the device pixel ratio and the time
between display frames), `Window` (visible throughout, focused, and the power source), `Canvas`
(the plan canvas, and the 3D canvas with its drawing buffer), and `Baseline` (its commit and date,
or "not measured").

Then comes a table with one row for each time:

| Column      | Meaning                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------- |
| Time        | What the row measures.                                                                   |
| Budget      | The budget for the row, in milliseconds.                                                 |
| Median      | The median of the timed samples, in milliseconds.                                        |
| p95         | The 95th percentile, by nearest rank, in milliseconds.                                   |
| Base median | The median in the baseline, or "not measured" when there is no baseline.                 |
| Change      | The difference of the two medians and their ratio, such as `+0.42 ms (1.08x)`, or `n/a`. |

The rows come in four groups:

- Plan redraw: one call of `drawPlan` on a visible 800 x 600 canvas, once for each animation frame,
  while the end of the ground floor's first wall moves on a circle of 500 mm, as a drag does.
- 3D update, one row for each of the six reference edits: from just before the command is
  dispatched to just after the scene of the whole building is reconciled.
- 3D frame, for each of four views (floor or building, schematic or realistic lighting), in two
  rows: `main thread` is the work of the frame on the main thread, and `until GPU done` runs from
  the start of the frame until the GPU reports that its work is finished. Each frame starts with an
  idle GPU, so the figure is the time of one isolated frame.
- 3D frame after an edit: the first frame after each of the six edits, in the building view with
  schematic lighting, in the same two rows.

The 3D rows have a budget of 8.0 ms, from section 6.10 of the design specification. The plan row has
16.7 ms, one frame at 60 a second, marked with an asterisk, because the specification states no plan
budget. A budget is a reference line. A time over it prints like any other.

Samples come after a warm-up. The plan redraw takes 60 warm-up and 300 timed samples. Each 3D
update takes 10 and 100, each view 120 and 300 frames, and each frame after an edit 30 timed samples.

### When the command refuses

When the command cannot measure, it prints `Nothing was measured.` and one reason for each cause,
writes no file, and exits with code 2. A bad flag exits with code 1. The reasons, with what to do:

- No WebGPU adapter, a fallback adapter, or a software renderer. Use a machine whose browser uses
  its hardware GPU.
- The window was hidden at the start or during the run. Keep it visible and in front.
- No display frame arrived, or none within 2 seconds during a phase, or the frames came more than
  34 ms apart because the browser is throttling. Keep the window in front, turn off power saving,
  and close other heavy applications.
- The live view reported a renderer failure, threw, was not ready within 30 seconds, or a phase
  returned no frames. Run again. If it repeats, the timing page needs a fix.
- The GPU did not finish a frame within 10 seconds, or the device was lost. Run again, and update
  the graphics driver or the browser if it repeats.
- The frames made no WebGPU work, so the renderer fell back to WebGL 2, or only some frames made
  any. The command never keeps a fallback figure. Run again on a hardware WebGPU adapter.
- The baseline file cannot be read or is not a valid timing record. Fix or remove it, or pass
  another path with `--baseline`.

A run can also carry warnings. They print at the end of the report and do not stop the run:

- a quick check, in this run or in the baseline;
- battery power, or a power source the browser cannot report;
- uncommitted changes;
- a window that was not focused;
- a difference from the baseline in the device pixel ratio, the drawing buffer size, the plan
  canvas size, the CSS size of the 3D canvas, the browser, the adapter, or the processor.

### The baseline

The baseline is `tests/performance/baseline-times.json`. It does not exist yet, so every comparison
reads "not measured". The first baseline comes from a run that the owner of the project schedules on
his machine. Until then this repository holds no timing figures.

`pnpm perf:report --write-baseline` writes the file after a full run. It refuses to write it, still
prints the report, keeps the run file, and exits with code 2 when:

- the run was a quick one (this fails at once, as a flag error, before the browser opens);
- the machine ran on battery power;
- tracked files had uncommitted changes;
- the window was not visible throughout;
- the WebGPU adapter is a software renderer.

### What is not measured

- The raster of the plan canvas, which the browser does after `drawPlan` returns.
- React's render and commit of the plan view and of the 3D view.
- The first frame after load, with its module load and shader builds.
- Memory.
- Input latency.

Two facts about the timing page. Furniture is drawn as boxes, because the reference project names a
model that no catalog holds, so each mount of the 3D view logs one failed model load in the browser
console. And the command measures only on a hardware WebGPU adapter. It does not time the WebGL 2
fallback.

### Where the code lives

- `scripts/performance/report-times.mjs` is the driver. It builds and serves the page, opens the
  browser, prints the report, and writes the files. `timing-arguments.mjs` parses the flags.
- `tests/performance/timing/page/` is the timing page that runs inside the browser.
- `tests/performance/timing/*.ts` holds the pure modules: the statistics, the record, the
  conditions, the report, the frame probe, and the order of a run. Each has its tests beside it.

ADR-0186 describes the method in full.
