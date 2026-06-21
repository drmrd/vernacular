---
slug: decisions/ADR-0117-storybook-story-visual-regression
title: 'ADR-0117: Visual regression for Storybook stories'
type: decision
tags: [tooling, testing, storybook, stories, visual-regression, playwright, screenshots, docker, ci]
related:
  [
    decisions/ADR-0105-storybook-browser-mode-component-tests,
    decisions/ADR-0111-story-coverage-guardrail-and-backfill-policy,
    decisions/ADR-0045-three-dimensional-render-harness-and-conventions,
    decisions/ADR-0013-cooldown-exclusions,
  ]
sourceFiles:
  [
    playwright.stories.config.ts,
    e2e/stories/story-visual.spec.ts,
    scripts/serve-static.mjs,
    scripts/serve-static.test.ts,
    scripts/story-index.mjs,
    scripts/story-index.test.ts,
    package.json,
    .github/workflows/ci.yml,
  ]
status: current
updated: 2026-06-20
---

# ADR-0117: Visual regression for Storybook stories

## Status

Accepted, landed. Every testable Storybook story now has a committed screenshot baseline, and
CI fails when a story's rendered pixels drift from it. The baselines are generated in a linux
container so they match the ubuntu CI runner, and the suite reads its story list from the built
Storybook index, so it grows on its own as the story backfill in ADR-0111 lands.

## Context

ADR-0105 made stories run as browser-mode component tests. That harness mounts each story,
replays its play function, and runs an accessibility check, but it never looks at the rendered
pixels. A component can keep passing its interaction test while its padding, color, or border
quietly changes. Nothing catches that today.

The project already does visual regression elsewhere. ADR-0045 set up Playwright with committed
screenshot baselines for the home page and the three-dimensional scene, with a per-platform
suffix on the baseline file and a pixel-ratio tolerance that absorbs driver and antialiasing
noise. What was missing was the same treatment for the component stories, which are the part of
the interface most likely to change by accident during a refactor of the design system.

The story backfill from ADR-0111 is still in progress through its per-area follow-on issues, so
the set of stories is a moving target. Any visual-regression suite that names its stories by hand
would fall out of date the moment a backfill issue lands. It has to discover the stories itself.

## Decision

Screenshot every testable story with Playwright against a static Storybook build, and commit the
baselines to the repository.

### Playwright against a static build, not a hosted service

A hosted visual-testing service was the obvious alternative and was rejected. It keeps the
baselines off the repository, needs an external token in CI, and bills per snapshot. Committed
PNGs reviewed in the pull request keep the baseline next to the code that produces it and need no
account or secret. The cost is repository size, which is small for these component shots and is
discussed under consequences.

The screenshots come from the static `storybook-static` build rather than a running dev server,
so the run has no application bundle to boot and no app state to settle. The build is the same
artifact CI already produces in the `storybook-build` job, so the gate reuses work that was
happening anyway.

### A separate Playwright config for the story suite

The story suite lives in its own `playwright.stories.config.ts` rather than as another project in
the app `playwright.config.ts`. The reason is the web server. Playwright starts every web server a
config declares before it runs any project, with no way to scope a server to one project. The app
config already runs the app preview server, and the story suite needs a different server that
serves the static Storybook directory. Folding both into one config would force every app
end-to-end run to also build Storybook, and would force the `storybook-build` CI job, which has no
application bundle, to start an app preview server that has nothing to serve. Keeping the story
suite in its own config gives it exactly one web server and leaves the app suite untouched.

### A dependency-free static server

The static directory is served by `scripts/serve-static.mjs`, a small server built on the node
`http` and `fs` modules. Adding a packaged static server would mean a new dependency under the
thirty-day cooldown from ADR-0013 for something node already does in about forty lines. The server
maps a file extension to a content type, returns 404 for a missing file, and rejects a path that
escapes its root. It carries its own unit test. Because the server has no index fallback and
returns 404 for `/`, the Playwright web server readiness probe points at `/index.html`, a file that
always exists in the build, since Playwright treats a 404 as a server that is not ready yet.

### The story list comes from the built index

`scripts/story-index.mjs` reads the `index.json` that `build-storybook` writes and returns the ids
of the stories to screenshot. It keeps an entry only when it is a story rather than an autodocs
page, and only when it carries Storybook's `test` tag. The tag is the same signal the browser-mode
harness uses: a story opts out of automated testing with the `!test` tag, and that opt-out then
appears in the built index as a story without the `test` tag. The full-application shell story uses
exactly this opt-out, because it mounts the live WebGPU scene and replays a slow interaction, which
is neither a stable nor a meaningful thing to screenshot. Filtering on the tag excludes it without a
hand-maintained denylist, and any future story that opts out of testing is excluded for free. The
spec turns an empty story list into a loud failure rather than a vacuous pass, so a missing or
unbuilt index fails the suite instead of silently registering zero baselines.

### Baselines are committed, linux-only, and made in docker

Screenshot pixels depend on the operating system that rendered them, because each operating system
ships a different font stack. The CI runner is ubuntu, so a darwin render would diff against the
wrong glyphs on every run. The baselines therefore have to be linux, and the `stories:update-snapshots`
script generates them inside the pinned Playwright linux container, the same container family the
existing end-to-end snapshot script uses. The snapshot path template pins the baseline suffix to
`linux` regardless of the host, since every committed baseline is a linux render by construction. A
developer who runs the story suite directly on a mac sees a mismatch by design, so the suite is left
out of the default local `pnpm e2e` and runs only in CI and through the docker refresh script.

The container runs at the host's processor architecture rather than a forced amd64. Chromium cannot
launch under qemu amd64 emulation on an arm64 host, so an arm64 development box renders the baselines
with arm64 linux chromium while CI diffs them with amd64 linux chromium. Those are two different
chromium builds, so their renders are not guaranteed identical to the bit, and they do not need to
be. Playwright compares with a per-pixel threshold, and for these flat component renders the only
difference between the two builds is a small antialiasing variance on glyph and border edges that
stays under it. The CI gate is the authority on what counts: a real visual change exceeds the
threshold and fails the run, the cross-build noise does not, and if a future chromium build ever
widens that noise the baseline is refreshed from the failing run's own diff report.

### Determinism

Each screenshot disables animations, waits for the story root to be visible, and waits for web
fonts to finish loading before it captures, so glyph metrics are settled. The tolerance starts at a
small different-pixel ratio that absorbs sub-pixel antialiasing between the docker baseline and the
CI runner. A single story that proves flaky can widen its own tolerance later without loosening the
gate for the rest.

### The CI gate

The `storybook-build` job already installs chromium and builds Storybook. The gate adds one step
after the build that runs the story suite against the committed baselines, and uploads the Playwright
diff report when it fails so a reviewer can see the before, after, and difference images. The job
stays on ubuntu, which is what makes the committed linux baselines the right reference.

## Consequences

- An accidental visual change to a covered component now fails CI with a pixel diff, which the
  browser-mode interaction test would have let through.
- The suite tracks the story backfill on its own. Each story that ADR-0111's follow-on issues add
  joins the visual gate as soon as it carries the `test` tag, with no edit to the spec.
- There is one committed PNG per testable story, on the order of twenty today and growing toward the
  full component set. The shots are small. If review noise from the baseline files grows, a later
  change can group them or coarsen the tolerance.
- Baselines are committed linux renders, refreshed by a native-speed run of the linux container at
  the host architecture and needed only when a component intentionally changes. They are made with
  arm64 chromium on an arm64 development box and diffed with amd64 chromium in CI; Playwright's
  per-pixel threshold absorbs the small cross-build antialiasing difference, and the CI gate stays
  the authority on what counts as a real change.
- The suite carries no new runtime dependency. The static server is node built-ins, so the cooldown
  and exact-pin rules do not come into play.
- The story suite is deliberately absent from the default local `pnpm e2e`. A developer who wants to
  refresh or inspect it uses the dedicated scripts, and a direct local run on a mac is expected to
  mismatch.

## References

- ADR-0105 (the browser-mode component-test harness these stories already run under).
- ADR-0111 (the story coverage backfill that this suite tracks as it lands).
- ADR-0045 (the Playwright screenshot-baseline conventions this reuses for components).
- ADR-0013 (the thirty-day cooldown policy, which the dependency-free static server stays clear of).
