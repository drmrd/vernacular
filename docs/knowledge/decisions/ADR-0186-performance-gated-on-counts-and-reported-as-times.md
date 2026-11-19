---
slug: decisions/ADR-0186-performance-gated-on-counts-and-reported-as-times
title: 'ADR-0186: Performance is gated on counts of work and reported as times'
type: decision
tags: [performance, testing, ci, plan-rendering, three-dimensional, baseline]
related:
  [
    decisions/ADR-0088-three-dimensional-incremental-scene-updates,
    decisions/ADR-0089-within-floor-mesh-reuse,
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0177-open-transactions-for-changes-in-progress,
    decisions/ADR-0016-lighthouse-stryker-fixtures,
  ]
sourceFiles:
  [
    editor/plan/draw-plan.ts,
    editor/plan/draw-plan-test-fixtures.ts,
    bridge/react/framed-scene-reconciler.ts,
    bridge/react/floor-build.ts,
    docs/specs/2026-06-01-vernacular-design.md,
    scripts/performance/report-times.mjs,
    scripts/performance/timing-arguments.mjs,
    scripts/performance/timing-launch.mjs,
    scripts/performance/timing-browser-processes.mjs,
    scripts/performance/timing-browser-session.mjs,
    scripts/performance/timing-console.mjs,
    tests/performance/README.md,
    tests/performance/timing/timing-statistics.ts,
    tests/performance/timing/timing-record.ts,
    tests/performance/timing/run-conditions.ts,
    tests/performance/timing/timing-report.ts,
    tests/performance/timing/timing-comparison.ts,
    tests/performance/timing/scripted-drag.ts,
    tests/performance/timing/plan-redraw-timing.ts,
    tests/performance/timing/reference-session.ts,
    tests/performance/timing/scene-update-timing.ts,
    tests/performance/timing/frame-probe.ts,
    tests/performance/timing/frame-result-checks.ts,
    tests/performance/timing/render-variants.ts,
    tests/performance/timing/reference-scene-stage.tsx,
    tests/performance/timing/run-timing.ts,
    tests/performance/timing/page/index.html,
    tests/performance/timing/page/main.tsx,
    tests/performance/timing/page/page-instruments.ts,
    tests/performance/timing/page/page-phases.ts,
    tests/performance/timing/page/page-observe.ts,
    tests/performance/timing/page/page-layout.ts,
    tests/performance/timing/page/page-waits.ts,
    tests/performance/timing/page/frame-collection.ts,
    tests/performance/timing/page/scene-stage.tsx,
    tests/performance/timing/page/scene-commit.ts,
    tests/performance/timing/page/live-view.tsx,
  ]
status: current
updated: 2026-11-18
---

# ADR-0186: Performance is gated on counts of work and reported as times

## Status

Current. The owner chose on 2026-11-14 that CI gates on counts and that times are reported, not
gated. The owner approved the rest the same day, with section 5.6 of
`docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md`, and chose their development machine
for the first baseline of times. The count tests and the timing command arrive with #684.

## Context

Section 6.10 of the design specification budgets 8 ms for the scene update and 8 ms for the render
on a project of a stated size. It names a profiling harness in `engine/profiling/`, and section 9.3
names a benchmark harness in the same place. Neither exists, and nothing measures the budgets.

The architecture refactor round changes the code that runs on every pointer move. Without a
baseline, a stage cannot show that it did not make editing slower.

A time measured in CI depends on the runner and varies between runs. A check that fails at random
is soon ignored or switched off. A harness in `engine/` could not measure the plan in any case,
because the plan is drawn in `editor/`.

## Decision

- One deterministic generator builds a reference project that meets section 6.10: 4 floors, 200
  furniture instances, 50 openings and stairs, and paint on surfaces.
- CI gates on two counts for that project, compared for exact equality with a committed baseline:
  the drawing-context calls of one plan redraw per floor, and the 3D groups rebuilt by each edit in
  a fixed list.
- A pull request that changes a count updates the baseline and says why. That holds for a lower
  count too.
- One local command measures plan redraw time, 3D scene update time, and 3D render time in a real
  browser. It prints them beside a committed baseline with a description of both machines. It never
  fails on a time, and no CI job runs it.
- A baseline comes from a machine with a hardware GPU. The command refuses to write one from a
  software renderer.
- The counts are defined by what can be observed, not by function names, so the tests move with the
  code when a later stage replaces it.

## Consequences

- The gate cannot fail at random, because the counts are the same on every machine.
- A count does not prove a time. A change can keep every count and still be slower. The reported
  times cover that, and they depend on a person running the command on `main` and on the branch on
  one machine.
- A deliberate change to drawing has one more file to update.
- Sections 6.10 and 9.3 of the design specification point to this mechanism in place of
  `engine/profiling/`.
- The counts show today's behavior as it is. An edit to one wall rebuilds every wall on its floor,
  and a paint edit rebuilds the groups of every floor (4 wall groups, 40 rooms, 44 openings, and
  200 furniture groups on the reference project), because the paint reference belongs to the
  project. Every edit except a rename rebuilds all four floor wrapper groups. The gate records three
  numbers for each edit and kind: rebuilt, removed, and added. Later stages can lower those numbers
  on purpose.

## Update (2026-11-18): the timing command

The local command of the decision now exists as `pnpm perf:report`. It changes no product file.
This update says what it does, what each figure means, and when it refuses to run. It holds no
timing figure, on purpose: nothing has been measured yet.

### What the command does

`pnpm perf:report` runs `scripts/performance/report-times.mjs`, the driver. It launches and closes
the browser through the browser session in `scripts/performance/timing-browser-session.mjs`. In
order, it:

- reads its flags and checks the baseline file before the build and the browser. With
  `--write-baseline` it also refuses at this point when tracked files have uncommitted changes;
- builds a timing page, `tests/performance/timing/page/`, with Vite in production mode, into
  `node_modules/.cache/performance-timing/page`. The app build does not contain the page, so
  nothing of it reaches the production entry;
- serves the built page on `127.0.0.1` with `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp`. This makes the page cross-origin isolated, and
  Chromium then gives `performance.now()` a step of 5 microseconds instead of 100. The page measures
  the step it gets and the record keeps it;
- launches Chromium (channel `chromium`) in a visible window. The launch step has a `headless`
  parameter, but only a hand-written script can set it: the command always opens a visible window,
  and the report prints the word "headed" as fixed text. On macOS it passes the GPU flags of
  the scene test project, `SCENE_WEBGL_LAUNCH_ARGS` in `playwright.config.ts`
  (`--enable-unsafe-webgpu`, `--use-angle=metal`, `--use-gpu-in-tests`, `--ignore-gpu-blocklist`).
  On other platforms it passes none, as that project does. It adds `--window-size=1280,900` and
  `--js-flags=--expose-gc`, opens the page with the window's own size and pixel ratio, and brings
  the page to the front. From before the page loads, it collects the page's console warnings,
  console errors, and uncaught page errors;
- makes one call into the page, `window.vernacularTiming`. The page runs every phase and returns a
  record with its report, or the reasons it refused. Nothing polls the page while it runs. A page
  that has not answered within 30 minutes ends the run as a refusal;
- checks the collected console messages (see "The page console" below);
- prints the report on the terminal, with a "Console" part below it, and writes the run file;
- closes the browser and the server. Before and after the launch, the browser session reads the
  process list (`ps -Aww -o pid=,ppid=,command=`, wide output so that no platform cuts a command
  line). It notes the browser's main process, the folder of that browser (the application bundle
  on macOS, otherwise the directory of the executable), and the crash handler processes from that
  folder that appeared with the launch. At the close it asks the browser to close, waits up to 10 s
  (looking every 50 ms) for the main process to be gone, and then stops those noted helpers that a
  fresh process list still shows as crash handlers with parent 1 inside that folder. With no known
  folder it stops nothing. With no usable folder (an executable at the file system root, or with
  no folder) the command stops nothing either. The wait for the close to report stays limited to
  10 s as a net. A close that fails or does not report in time gives a note and does not lose a
  measured run. The command ends its process after an error as it does after a run. See "Limits"
  for why the helpers are stopped;
- exits with 0 when it measured; with 2 when it refused or could not measure, and also when it
  measured but refused to write the baseline; and with 1 on an error, such as an unknown flag, a
  `--baseline` file that does not exist, or a failed build.

The flags:

- `--out <path>` writes the run file to that path. The default is
  `node_modules/.cache/performance-timing/run-<commit>-<local date and time>.json`, with the first
  eight characters of the commit. Git ignores that folder.
- `--baseline <path>` compares with that run file instead of
  `tests/performance/baseline-times.json`. A path given here must exist: if it does not, the
  command stops with exit code 1 before the build. When the default file does not exist, the run
  has no baseline yet.
- `--write-baseline` also writes the run as the baseline, under the rules below.
- `--quick` takes a tenth of the samples. With `--write-baseline` it is a flag error.
- `--help` prints the usage.

The command never fails on a time. A time over its budget prints like any other. No CI job runs it,
`pnpm test` never launches a browser, and no file of the page is named as a test. To compare a
branch with `main` on one machine, run
`pnpm perf:report --out node_modules/.cache/performance-timing/main.json` on `main`, then
`pnpm perf:report --baseline node_modules/.cache/performance-timing/main.json` on the branch. A
relative path resolves against the worktree where the command runs, so when `main` and the branch
are two worktrees, `--baseline` takes the absolute path of the file in the `main` worktree.

### What each figure is

**Plan redraw.** The main-thread time of one `drawPlan` call on a real 800 by 600 canvas, the size
the app uses. The clock is read just before the call and just after it returns, and one draw runs in
each animation frame. The draws follow a scripted endpoint drag on the ground floor. Its first wall
is selected and carries the endpoint handles. The preview runs from the wall's fixed start to an end
that walks a circle of 500 mm around the wall's real end, one step a frame, with no snap. Only the
preview, the selection, and the handles are set; the walls, the rooms, and every other option are
the same objects in every frame. That is what happens in a real drag today, where only the preview
changes until the release. The options of all frames are built before timing starts. The raster that
the browser does later is not in the figure. The phase takes 60 warm-up draws and 300 timed ones.

**3D update.** From just before the dispatch of an edit to just after the reconciler returns, for
the whole building. The scene graph is scoped with `viewSceneGraph` (scope `building`, underground
shown) and reconciled with the project's paint. Inside the interval: the command with its undo
capture, the derivation of the scene graph, the scoping, and the rebuild of the changed groups.
Outside it: React's render and commit of the live view, the attach of a new scene root, the upload
of new buffers to the GPU, and the undo and its reconcile. That undo runs untimed after each sample,
so every sample starts from the reference document with a warm reconciler cache. One session and one
reconciler serve all edits, and the commands are built from a second, untouched reference project
before the loop. Furniture is built as boxes, as in the count gate. There is one row for each of the
six reference edits: `move-wall-endpoint`, `move-furniture`, `resize-opening`, `paint-surface`,
`set-ceiling-height`, and `rename-project`. The rename is the control row: the fixed cost of an edit
that rebuilds nothing. Each edit takes 10 warm-up and 100 timed samples.

**3D frame.** The real live view (`SceneCanvas` inside the providers it reads) in a box of 960 by
600 CSS pixels, on a hardware WebGPU adapter. Its drawing buffer follows the device pixel ratio,
which the 3D canvas library caps at 2 by default. The page checks the CSS size after each mount, and
the record keeps both sizes. A frame is one browser frame, with every page callback that runs in it.
The 3D library runs an animation loop of its own beside the render loop, so each browser frame runs
two callbacks and only one of them submits GPU work. A probe, installed before any other module of
the page loads, wraps the frame request and cancel functions and `GPUQueue.prototype.submit`. Each
frame gives two figures:

- main thread: from the start of the first callback to the end of the last. It is the time of the
  page's frame callbacks only. The browser's own style, layout, paint, and commit after them are not
  in it, and neither are React's passive effects;
- until GPU done: from the same start until the `onSubmittedWorkDone` promise of the frame's last
  submit resolves. This is an upper bound, because the promise reaches the main thread some time
  after the GPU has finished. It does not include the compositor's present of the frame.

The timed frames are paced. While the GPU work of a frame is pending, the probe holds every page
callback, and the held callbacks run on the next browser frame after the work is done. Each timed
frame therefore starts with an idle GPU and a free main thread, and its promise does not wait behind
the next frame. The figure is the time of one isolated frame, which is what an 8 ms budget for a
frame asks about. It is not a throughput figure.

Four views are timed, listed in `RENDER_VARIANTS`: the floor and the building scope, each in
schematic and in realistic lighting. For each view the live view mounts anew, and the page waits for
the readiness attribute and for `frameDrawnSincePipelineSettled`. Then come 120 warm-up frames,
unpaced, the switch to paced mode, which drops the two frames that the switch can split, and 300
timed frames. After the timed frames the page checks that the stores still hold the view's scope
and lighting mode and that the settled flag is still true; otherwise the run fails. The check
reads the stores once, after the frames. It sees a change of a store, and a pipeline rebuild that
has not settled by then. It does not see a rebuild that starts and settles inside the timed frames.
The page gives
no camera input, so the live view's automatic framing stays on (`FrameCamera` in
`bridge/react/scene-camera-effects.tsx`). The camera is where that framing puts it, fitted to the
bounds of the model, and the framing can set it again after an edit that changes those bounds. The
command does not time a camera that orbits or walks.

**3D frame after an edit.** In the building view with schematic lighting, paced, for each of the six
edits, 30 samples. The 3D scene lives in the canvas library's own React root, which commits in a
later task of React's scheduler than the dispatch. So each sample holds the page's frame callbacks
(`setHeld` of the frame probe) from just before the dispatch until the mounted scene holds a new
scene object. Under the hold a browser frame runs no page callback and gives no sample. The scene's
commit needs no page frame callback, because the canvas library commits in a scheduler task, and
the wait polls on timer tasks, not on frames. Only after the release does the page note the time,
and it times the first frame that starts after it. No page frame can draw the edit before that
frame, which carries the work that the edit adds to the next frame. The sample then undoes the
edit under the same hold, waits in the same way for the scene to take the undo, and lets two
frames pass untimed. `rename-project` changes nothing in the scene: for it the page waits 100 ms
under the hold for a change that does not come, then goes on. Any other edit that has not reached
the scene within 5 s fails the run.

**The statistic.** For each list of samples, the median (the mean of the two middle samples for an
even count) and the 95th percentile by nearest rank, `sorted[ceil(0.95 n) - 1]`, rounded to 0.01 ms,
with the sample count. The record holds these summaries and the warm-up and timed counts of each
phase, not the raw samples. A garbage collection runs before each phase and each mount. A collection
inside a sample stays in it and shows in the 95th percentile. A quick run divides every count by 10,
keeping at least 10 (a count of zero stays zero). Its record says `quick: true`, and its report says
"Quick check, not a measurement." A quick run is not a measurement and cannot become a baseline.

### When a run is refused

A refused run prints "Nothing was measured." with one reason for each cause, writes no file, and
exits with code 2. The causes, in the order in which they are checked:

- Before the build and the browser (the driver): the baseline file cannot be read, or it is not a
  valid timing record; or `--write-baseline` was given and tracked files have uncommitted changes.
- At the start of the run (`run-conditions.ts`, `run-timing.ts`): the page is not a production
  build; the browser offers no WebGPU adapter, a fallback adapter, or one whose name is a software
  rasterizer (SwiftShader, llvmpipe, Software, Basic Render Driver); the page is hidden, or was
  hidden at any time since it loaded; no display frame arrives within 2 s; or the median of 30
  intervals between display frames is over 34 ms, which means the browser throttles frames.
- During the phases (the page's guards; the driver turns a failure of the page into a refusal): no
  browser frame arrives within 2 s during any wait (the message says that the browser stalled when
  the page is visible, and asks for a visible window when it is not); while a new view gets ready
  the allowed gap between browser frames is 10 s instead, inside the 30-second limit for the view
  to get ready; the plan canvas gives no 2D context; the live view reports a renderer failure
  (`data-scene-renderer-failed`) or throws; it is not ready within 30 s; it draws no canvas, or its
  canvas is not 960 by 600 CSS pixels; the GPU does not finish a frame within 10 s; the stores no
  longer hold a view's scope, lighting mode, or settled flag after its timed frames; an edit does
  not reach the scene within 5 s; or a phase returns no samples for one of its entries.
- When the page has not answered within 30 minutes (the driver).
- At the end of the run (`run-timing.ts`, `frame-result-checks.ts`): the page is hidden, or was
  hidden at any time during the run. For each view and each edit: no frames; a frame whose done
  promise rejected; a frame taken while the page was hidden; no frame with WebGPU work, which means
  that the renderer fell back to WebGL 2; or WebGPU work in only some of the frames.
- After the run, the page console (`scripts/performance/timing-console.mjs`): see below.

### The page console

The driver collects the page's console warnings, console errors, and uncaught page errors and
hands them to `judgeConsole` in `scripts/performance/timing-console.mjs`, which sorts them with
`classifyPageMessages`. `judgeConsole` is the step that turns a measured run into a refused one,
and its unit tests are in `scripts/performance/timing-console.test.ts`. Three kinds of message
refuse the run, even one whose times were measured:

- the product's message that the ambient-occlusion pipeline failed to build. The realistic lighting
  then goes on without the effect, so the realistic frames would be faster than their name says.
  This was the reason for the guard;
- the product's message that a stage of the scene renderer failed;
- the 3D library's "Device Lost" message.

Two known harmless messages are counted and not listed: the failed load of the reference project's
furniture model, and a deprecation notice of the 3D library's clock module. Every other message is
printed in the "Console" part below the report, up to 10 of them, and the rest are counted. Unit
tests read the source files that log the ambient-occlusion failure, the renderer failure, the
furniture model failure, and the lost device, and they fail when one of these texts is reworded.
That is how the guard stays alive. The text of the clock notice is not checked in this way.

A lost GPU device is caught in more than one way, and none of them is complete on its own: the
console guard above refuses on the library's "Device Lost" message; the probe marks a frame whose
done promise rejects, and such a frame refuses the run; and an entry whose later frames make no GPU
work is refused because only some of its frames have GPU work.

Some conditions only warn, at the end of the report: a quick run or a quick baseline; battery power;
a power source that the page cannot read; uncommitted changes; a window that was not focused at the
start or at the end; and a difference from the baseline in the device pixel ratio, the drawing
buffer, the plan canvas size, the CSS size of the 3D canvas, the browser, the adapter, the
processor, or the operating system. The record keeps the timer step and the report prints it, but
a coarse timer gives no warning.

When there is a baseline, the report's header has a "Base machine" line with the baseline's
processor, WebGPU adapter, operating system, and browser. Below the table, a note says that 3D
frames are paced and each is timed alone, that the figure that waits for the GPU is an upper bound,
and that furniture is drawn as boxes.

`--write-baseline` has more rules (`baselineWriteRefusals` in `run-conditions.ts`). It does not
write a baseline from a quick run (the flag check stops that first), from a run on battery power,
from a run with uncommitted changes (the driver stops that before the build), from a run whose
window was not visible throughout, or from a software adapter. A power source of "unknown" is
accepted, with the warning above, because the page cannot always read it. When a baseline is
refused, the report still prints and the run file is still written, but the baseline file is not,
and the exit code is 2.

### The record and the baseline

Every run writes a `TimingRun` (`tests/performance/timing/timing-record.ts`): format 1, JSON with a
two-space indent and a fixed key order. It holds whether the run was quick; the commit and whether
tracked files had changes; the local time with its offset; the build mode (always `production`) and
the timer step; the machine (processor, logical cores, memory, operating system, browser, the WebGPU
adapter as vendor, architecture, and device, the unmasked WebGL renderer, and `renderer`, which is
`webgpu` for now); the conditions (visible throughout, focused, power, device pixel ratio, display
frame interval, and the plan canvas, 3D canvas, and drawing buffer sizes); the sample counts of each
phase; and the summaries. The canvas sizes and the pixel ratio come from the observation at the end
of the run, because the 3D canvas exists only after the first mount. The reader of the record names
the first field that is missing or of the wrong type.

The baseline is `tests/performance/baseline-times.json`, a `TimingRun` like any run file. The plan
named it `timing-baseline.json`; the new name sorts it with the other baseline files. It does not
exist yet. The first baseline comes from a run that the owner of the project schedules on his
machine, and it lands in a separate pull request. Until then every figure is "not measured", and the
report prints "not measured" in its baseline column. This update holds no timing figure, on purpose.

### Deviations and narrowings

The command differs from the specification and from the plan in four points. The owner of the
project accepted each of them on 18 November 2026.

**WebGPU only.** Section 5.6 of the specification says that the command names whether the renderer
ran on WebGPU or WebGL 2. The command measures only on a hardware WebGPU adapter and refuses to run
otherwise. The reason: the GPU time comes from the WebGPU queue, and a WebGL 2 path would need
another way to wait for the GPU. The record keeps the `renderer` field, so that a WebGL 2 option can
come later as a separate, labelled run. Issue #872 tracks timing on the WebGL 2 fallback.
Until it lands, the narrowing has a cost: for a user whose browser falls back to WebGL 2, this
command gives no timing at all.

**A production page with a Node driver.** The plan for this work chose a browser-mode project of the
unit test runner. The command instead builds a production timing page and drives it from a Node
script. The reason: that runner serves the development transform, and a development build of the UI
library is slower in ways that say nothing about the product. The plan itself named a fallback, a
script that drives a preview build with a fixture page; the design as built is that fallback,
without an edit of the app's entry. A Playwright spec was not used either, because a timing run must
not pass or fail, and a spec in the scene test project would run in CI.

**Exit code after a refused baseline write.** Section 5.6 says that the command exits with success
unless it could not measure. When a run was measured but its baseline write was refused, the
command exits with code 2, so that a caller who asked for a baseline learns that none was written.

**The baseline column.** Section 5.6 says that each time is printed beside the committed baseline.
The report shows the baseline's median and the change of the medians, not the baseline's 95th
percentile. Issue #882 adds a column for it.

The green commits of this work have the type `build:`, as the plan said. The command is developer
tooling, and it stays out of the release notes.

### Limits and what is not measured

- The raster of the plan canvas. The browser does it after `drawPlan` returns. A readback would
  force it, but repeated readbacks make Chromium move the canvas to the CPU, which changes what is
  measured.
- React's render and commit, and the attach of a new scene root, after an edit. They are outside the
  3D update by design.
- The first frame after load, with its module loads and shader builds. It is a start-up cost, not an
  editing cost.
- Real furniture models. The reference project names a furniture model that no catalog holds, so
  furniture is drawn as boxes. Each mount of the live view logs one failed model load in the browser
  console: `Failed to load furniture model reference-massing-box`, from
  `bridge/react/furniture-model-cache.ts`.
- Memory, input latency from pointer to pixels, GPU time alone (it would need timestamp queries in
  `engine/renderer/create-renderer.ts`), and the plan and the 3D view drawing at the same time.
- The styles and quality levels of the daylight work, which are not on `main`. The list of views is
  one constant, `RENDER_VARIANTS`, that a later piece of work extends. The WebGL 2 fallback is not
  timed (see above).
- The realistic views were seen to queue GPU work during the unpaced warm-up. That is why the timed
  frames are paced.
- The adapter that the record names comes from the page's own adapter request. On a machine with
  two GPUs, the renderer's own request could pick the other one.
- A hidden or minimized window refuses the run. The command has no rule against a headless window,
  and it never opens one, as described above.
- The crash handlers of the browser. A diagnosis in a headless window, changing one thing at a
  time, found this: after a measured run, in which 3D views had mounted, the browser's two crash
  handler helper processes did not end with the browser. Each held the browser's error output
  channel, which the test library reads, so the library's close never reported. A blank page, and
  a run refused before any 3D view mounted, closed normally. Why the helpers stay after GPU work is
  not known. They have parent process id 1 from the start and process groups of their own, and
  their command line names nothing of their browser. Time alone is not enough to find them: other
  programs built on the same browser engine also run an executable named `chrome_crashpad_handler`
  with parent 1, and the launch takes a second or more, so a helper of one of them that started in
  that window would have been noted and stopped. On the development Mac the real process list held
  29 such helpers with parent 1, and 27 of them came from other programs. So the browser session
  notes only the helpers that appear during its launch and whose executable lies inside the folder
  of the browser it launched, and it stops them only after the browser's main process is gone. The
  pure helpers for this are in `scripts/performance/timing-browser-processes.mjs`, with unit tests
  on real process list lines. Without a process list (on Windows, or when `ps` fails) nothing is
  stopped, and the bounded close is what is left. The limit that is left: another test browser of
  the same install that starts during the launch could have its helpers counted as this browser's;
  it would lose only its crash reports.

### Evidence

The unit tests run with
`pnpm exec vitest run tests/performance/timing scripts/performance --project unit`: 21 test files
and 360 tests at the head of the branch on 2026-11-18, and all of them pass.

- `scripts/performance/timing-arguments.test.ts`: 14
- `scripts/performance/timing-browser-processes.test.ts`: 29
- `scripts/performance/timing-browser-processes-root.test.ts`: 16
- `scripts/performance/timing-console.test.ts`: 21
- `scripts/performance/timing-launch.test.ts`: 6
- `tests/performance/timing/frame-probe.test.ts`: 12
- `tests/performance/timing/frame-probe-hold.test.ts`: 10
- `tests/performance/timing/frame-probe-host-frames.test.ts`: 10
- `tests/performance/timing/frame-probe-paths.test.ts`: 11
- `tests/performance/timing/frame-probe-safety.test.ts`: 18
- `tests/performance/timing/frame-probe-two-loops.test.ts`: 17
- `tests/performance/timing/plan-redraw-timing.test.ts`: 12
- `tests/performance/timing/reference-scene-stage.test.tsx`: 9
- `tests/performance/timing/run-conditions.test.ts`: 33
- `tests/performance/timing/run-timing.test.ts`: 21
- `tests/performance/timing/run-timing-guards.test.ts`: 19
- `tests/performance/timing/scene-update-timing.test.ts`: 9
- `tests/performance/timing/timing-record.test.ts`: 28
- `tests/performance/timing/timing-report.test.ts`: 32
- `tests/performance/timing/timing-report-details.test.ts`: 18
- `tests/performance/timing/timing-statistics.test.ts`: 15

The page, the driver, and the browser session need a GPU browser, so no unit test covers them.
On 2026-11-18 they were checked in a browser on the development Mac, every time in a headless
window, with the launch step's `headless` parameter set by hand. These were checks of the wiring,
not measurements, and none of their figures is kept. The first checks ended in a refusal for the
display frame interval. Those slow frames most likely came from load on the machine: a later
plain quick run in a headless window, on a less loaded machine, was measured. With that limit
raised in a temporary copy, every frame sample of every view had GPU work, and every edit had
frames with GPU work. In the last check after the frame hold landed, the plain quick run was
measured; the samples of every view had GPU work; for each of the five edits that change the
scene, every timed sample had the new scene in place; and no page frame started inside a hold.
With the product's ambient-occlusion warning injected, the run was refused. With the crash
handlers limited to the browser's own folder, two measured quick runs in a row closed with no note
about a late close and left no process behind. A second test browser of the same install, open
during a run, kept its main process and both of its helpers. On the real process list, the rule
chose only the two helpers inside the browser's folder. In an earlier check with a second test
browser running at the same time, one attempt was refused because the browser stalled for more
than 2 s during a realistic view; closing other applications before a run matters.
The first run in a visible window was a quick check on the development Mac on 18 November 2026. It
ended as measured, with exit code 0. The report named the Mac's own GPU through WebGPU, the fine
timer step of a cross-origin isolated page, display frames at the full rate of the display, a
window that was visible throughout and focused, and mains power. The console part counted 10 known
harmless messages and none that was unexpected. The browser closed with no note about a late
close and left no process behind, and the run added no file to the working tree. Its two warnings
were the expected ones: a quick check, and uncommitted changes (this update was not committed
yet).

## References

- `docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md`, section 5.6.
- `docs/specs/2026-06-01-vernacular-design.md`, sections 6.10 and 9.3.
- Issues #684 and #502.
