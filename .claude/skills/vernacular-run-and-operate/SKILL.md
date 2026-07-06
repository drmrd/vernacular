---
name: vernacular-run-and-operate
description: 'Use when running or serving Vernacular locally or operating its machinery. Triggers: pnpm dev, preview, storybook, ports 5173/4173/6006/6107, the ?fixture=scene-harness deterministic 3D harness, data-harness-ready capture gating, scene or story baseline rendering, vernacular.json or .building project files, artifact dirs (dist, coverage, playwright-report, .lighthouseci), service worker or PWA behavior, or cutting a release with release-please (release PR, Release-As, ci-complete gate).'
---

# Running and operating Vernacular

## Overview

Everything here runs through pnpm scripts in `package.json` on fixed, verifiable ports, and the two deterministic capture surfaces (the 3D scene harness and the static Storybook build) each have an explicit readiness contract. Never guess a port, a query parameter, or a release step: they are all pinned below, verified against the repo as of 2026-07-05.

## When to use

- Starting the app (dev, production preview) or Storybook.
- Driving the deterministic 3D scene harness, or capturing screenshots from it.
- Locating or interpreting a build/test artifact directory.
- Understanding a project document on disk (`vernacular.json`, `assets/`, `.building`).
- Understanding the service worker / PWA behavior.
- Cutting or unblocking a release through release-please.

## When NOT to use

- Recreating the toolchain from scratch, Playwright browser installs, Node/pnpm setup, or the `vite.config.js`-is-a-build-artifact trap: use vernacular-build-and-env.
- Deciding which tests gate a merge, baseline tiers and tolerances, or how to add tests: use vernacular-validation-and-qa.
- The full catalog of URL parameters, env vars, and CI knobs: use vernacular-config-and-flags.
- Triage of a failing or flaky run: use vernacular-debugging-playbook.
- The floor-plan format's semantics (geometry, units, schema fields): use vernacular-domain-reference.

## Quick reference

| Command                | Port | What it does                                                                                        |
| ---------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| `pnpm dev`             | 5173 | Vite dev server (Vite default; no override in `vite.config.ts`). No service worker in dev.          |
| `pnpm build`           | -    | `tsc -b && vite build` into `dist/`.                                                                |
| `pnpm preview`         | 4173 | Serves `dist/` (Vite default port). CI-facing invocations pin `--port 4173 --strictPort`.           |
| `pnpm storybook`       | 6006 | Storybook dev server (`-p 6006 --no-open`).                                                         |
| `pnpm build-storybook` | -    | Static Storybook into `storybook-static/`.                                                          |
| `pnpm stories:test`    | 6107 | Playwright story visuals; its webServer runs `node scripts/serve-static.mjs storybook-static 6107`. |
| `pnpm storybook:test`  | -    | `vitest run --project storybook` (real-browser story tests).                                        |
| `pnpm e2e`             | 4173 | Playwright app suite; webServer runs `pnpm preview --port 4173 --strictPort`.                       |
| `pnpm lhci`            | 4173 | Lighthouse; `lighthouserc.json` starts the same preview command.                                    |

Key operational facts:

- The e2e base URL is overridable with the `E2E_BASE_URL` env var (`playwright.config.ts`).
- Locally Playwright reuses an existing server (`reuseExistingServer: !process.env.CI`). A stale preview on 4173 serves old bytes: after `pnpm build`, kill any old preview before re-running e2e.
- The story static server 404s on `/` (no index fallback); Playwright probes `/index.html` for readiness. If you serve `storybook-static/` yourself, request a real file.

## The deterministic 3D scene harness

The harness is a test-only seam: loading the app with `?fixture=scene-harness` mounts `SceneHarnessView` (`bridge/react/scene-harness-view.tsx`) instead of the editor, with no storage, autosave, or editor chrome (`app/app.tsx`). It renders a fixed 320x240 canvas, opaque background `0x1b2a3a`, `frameloop="never"` (no animation loop), and forces the WebGL 2 backend (`forceWebGL: true`) so committed baselines are hardware-WebGL renders (ADR-0045, `docs/knowledge/decisions/ADR-0045-three-dimensional-render-harness-and-conventions.md`).

Open it against the production preview (the baselines' surface) or the dev server:

```
http://localhost:4173/?fixture=scene-harness
```

### Query modifiers

All parsed in `app/app.tsx` and `app/harness-environment.ts`.

| Parameter | Values                     | Effect                                                                                                                                              |
| --------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fixture` | `scene-harness`            | Required to mount the harness at all.                                                                                                               |
| `temp`    | Kelvin number, e.g. `2700` | Lighting color temperature. Default 6500 (`DEFAULT_COLOR_TEMPERATURE_K`, `core/color/color-temperature.ts`). Non-numeric falls back to the default. |
| `paint`   | `demo`                     | Paints the shell room: floor `#cc6633` matte, all four walls `#3f7f5f` matte.                                                                       |
| `scene`   | see below                  | Selects a geometry fixture or a named environment state; one shared keyspace, keys disjoint by test-pinned contract.                                |

`scene=` geometry fixtures (`HARNESS_FIXTURES`): `shell` (default; 4000x3000 mm room, 120 mm walls, 2600 mm tall, one door, one window), `junctions` (T-junction plus acute bay, ADR-0080), `furniture` (shell plus one 1200x600x1500 mm massing box, ADR-0094), `adjacent-rooms` (two rooms sharing a wall, viewed from below the floor datum through a fixed camera pose, ADR-0150).

`scene=` named environment states (`HARNESS_ENVIRONMENT_STATES`): all pin the canonical site (latitude 40 N, longitude 75 W, north bearing 0, `America/New_York`) with realistic lighting on:

| State               | Observation            | Extras                                       |
| ------------------- | ---------------------- | -------------------------------------------- |
| `equinox-noon`      | 2026-03-20, minute 720 | -                                            |
| `winter-afternoon`  | 2026-12-21, minute 960 | -                                            |
| `color-check`       | 2026-03-20, minute 720 | neutral color-check lighting flag            |
| `overcast-noon`     | 2026-03-20, minute 720 | cloud cover 1 (fully overcast)               |
| `ambient-occlusion` | 2026-03-20, minute 720 | pairs the `furniture` geometry automatically |

### The ready frame: what it is and why capture waits

The harness draws exactly two frames. The mount frame keeps the canvas from sitting blank, but it races two asynchronous resources: the solar provider's visible sky arrives through a lazily imported chunk (ADR-0148/0149), and the ambient-occlusion pipeline builds asynchronously when active (ADR-0151). The second frame, the ready frame, is drawn only after those settle, and it is the only frame baselines may capture.

The synchronization contract is a DOM attribute, not a sleep or a pixel poll: the wrapper `div[data-testid="scene-harness"]` carries `data-harness-ready`, which flips to `"true"` in the same React commit pass whose layout effect renders the ready frame. Observable `"true"` implies the frame exists. Readiness is `lightingReady && (AO inactive || AO settled)`; the contract is settled-not-succeeded, so a failed sky chunk load or AO build still flips readiness and shows up as a baseline diff instead of a hung capture (ADR-0149, ADR-0151).

Wait for it exactly like `e2e/tests/scene-solar.spec.ts` does:

```ts
await expect(page.getByTestId('scene-harness')).toHaveAttribute('data-harness-ready', 'true')
```

### Where scene captures run and how baselines refresh

- `scene-*.spec.ts` files run only under the `scene-webgl` Playwright project (`playwright.config.ts`); the `chromium`/`firefox`/`webkit` projects `testIgnore` them. On darwin the project launches full Chrome for Testing with Metal ANGLE GPU flags; on linux it uses default flags (SwiftShader).
- Baselines are per-platform: `-darwin` PNGs render on the dev Mac (`pnpm exec playwright test --project=scene-webgl --update-snapshots=all`, ADR-0149); `-linux` PNGs render only via the manually dispatched `refresh-scene-baselines.yml` workflow, which uploads a `scene-baselines` artifact to download and commit (ADR-0152). Both families exist as of 2026-07-05 under `e2e/tests/scene-visual-regression.spec.ts-snapshots/` and `e2e/tests/scene-solar.spec.ts-snapshots/`.
- Which lanes gate a merge, and all tolerance numbers, live with vernacular-validation-and-qa.

## Project document anatomy

The Vernacular Floor Plan Format (ADR-0047; normative spec `docs/specs/2026-06-10-vernacular-floor-plan-format.md`):

- A project on disk is a folder: `vernacular.json` at the root (`PROJECT_FILE`, `storage/folder/folder-project-store.ts`) plus `assets/<contentHash>` files, content-addressed per ADR-0007.
- `.building` is that folder zipped for sharing (`storage/zip/zip-codec.ts`, fflate). The download filename is a slug of the project name plus `.building` (`storage/zip/bundle-filename.ts`). Export inlines every referenced asset at `assets/<hash>` so the bundle is self-contained (`storage/zip/export-project-bundle.ts`).
- Committed JSON Schemas live under `schema/8` through `schema/16`; the current version is 16 (`CURRENT_SCHEMA_VERSION`, `core/model/factories.ts`). `pnpm schema:check` verifies lockstep with the types; `pnpm schema:generate` regenerates.
- Fixture locations: hand-authored project documents in `tests/fixtures/projects/*.vernacular.json`, the digitized corpus in `tests/fixtures/projects/corpus/*.vernacular.json`, plus `tests/fixtures/{assets,registries,packs}`. Fixtures are append-only by convention (`tests/fixtures/README.md`): add new ones, never edit bytes a test depends on. The corpus source scans and metadata are committed under `resources/floor-plans/<nn-name>/`.

Format semantics (geometry, units, migration rules) belong to vernacular-domain-reference.

## Where artifacts land

All gitignored (`.gitignore` verified). Safe to delete; regenerate with the listed command.

| Directory            | Producer                          | Contents                                                                                                                                 |
| -------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `dist/`              | `pnpm build`                      | App bundle: hashed `assets/`, stable `service-worker.js` at root, `manifest.webmanifest`, icons, `packs/`, msw's `mockServiceWorker.js`. |
| `storybook-static/`  | `pnpm build-storybook`            | Static Storybook, served on 6107 by `stories:test`.                                                                                      |
| `coverage/`          | `pnpm exec vitest run --coverage` | v8 coverage: text, html, lcov (`vite.config.ts` test.coverage).                                                                          |
| `reports/jscpd/`     | `pnpm dup`                        | jscpd JSON duplicate report (`.jscpd.json` sets the output path). `reports/stryker/` also lands here.                                    |
| `playwright-report/` | Playwright html reporter          | Only produced when the html reporter is active (CI; local reporter is `list`).                                                           |
| `test-results/`      | any Playwright run                | Traces, failure screenshots, actual-vs-expected diffs.                                                                                   |
| `.lighthouseci/`     | `pnpm lhci` / `pnpm lhci:collect` | Lighthouse runs (3 per URL, desktop preset).                                                                                             |

## PWA and service worker behavior

- `vite.config.ts` declares `src/service-worker.ts` as a second Rollup input and emits it at the stable root path `/service-worker.js` (unhashed, so its scope covers the whole app); every other entry is hashed under `assets/`.
- Registration happens in `src/main.tsx` via `registerServiceWorker` (`storage/service-worker/register-service-worker.ts`), gated on `import.meta.env.PROD`. In dev it returns `skipped-development`; it never throws (outcomes: `registered`, `unsupported`, `skipped-development`, `failed`). So: the worker exists only in production builds, and only `pnpm preview` (or a real deploy) exercises it.
- The worker itself is a lifecycle scaffold as of 2026-07-05: `skipWaiting` on install, purge stale shell caches then `clients.claim()` on activate. No precaching or fetch strategy yet (deferred; design spec section 11). `e2e/tests/service-worker.spec.ts` covers registration.
- Do not confuse `public/mockServiceWorker.js` (msw's API-mocking worker for Storybook) with the PWA worker.

## Release operation (release-please)

The release machinery (all verified in `release-please.yml`, `release-please-config.json`, `.release-please-manifest.json`, and git history):

1. `googleapis/release-please-action@v4` runs on every push to `main`. It maintains a release PR from the branch `release-please--branches--main--components--vernacular`, accumulating Conventional Commits since the last release into `CHANGELOG.md` (sections for feat/fix/perf/refactor/docs/test/build/ci/chore; style hidden) and bumping `package.json` plus the manifest (currently `{".": "0.3.1"}`).
2. Pre-1.0 bump rules: `bump-minor-pre-major` (a breaking change bumps the minor) and `bump-patch-for-minor-pre-major` (a feat bumps only the patch). This is why a release full of features went 0.3.0 to 0.3.1.
3. Merging the release PR creates the tag (`include-v-in-tag: true`, so `vX.Y.Z`) and a published GitHub release (`draft: false`, `prerelease: false`). Both shipped releases merged with a merge commit, and the tag lands on that merge SHA (v0.3.1 = `f0a6129d`).
4. **Release-As override.** To force a specific version, land an empty conventional commit on `main` with a `Release-As: X.Y.Z` footer. Precedent: `d325606d` ("chore: request the 0.3.0 release", footer `Release-As: 0.3.0`).
5. **Why Release-As is sometimes required.** release-please infers the next version from the history since the last release. A history rewrite that leaves tagged SHAs unreachable from `main` desyncs that inference: the 0.3.0 request commit records exactly this ("the audit-desynced tag history inferred" a patch when semver called for a minor). Rule: never rewrite history that orphans release tags; if it has already happened, force the version with Release-As.
6. **Re-running the ci-complete gate.** `ci-complete` is the single required check (the aggregating job in `ci.yml`). A bot-updated release PR can sit with that gate stale or never run. Fix: push an empty commit to the release branch to fire a PR `synchronize` event. Precedent, both empty commits that landed through release PR merges: `40e27c7c` ("chore: re-run required checks for the 0.3.0 release") and `95cc95d7` ("chore: synchronize the release branch to rerun the merge gate").
7. Tags may lag your local clone: v0.3.1 existed on `origin` while absent locally. Run `git fetch --tags` before reasoning about released versions.

Branch protection, PR review requirements, and the red-green-blue discipline around what may land on `main` belong to vernacular-change-control; nothing here bypasses them.

## Common mistakes

- Screenshotting the harness before `data-harness-ready="true"`: the mount frame lacks the sky and ambient occlusion, so the capture is wrong yet plausible-looking.
- Expecting `scene-*.spec.ts` output from `--project=chromium`: those projects ignore scene specs by design; use `--project=scene-webgl`.
- Refreshing `-linux` scene baselines on a Mac: darwin renders only `-darwin` files. The `-linux` family comes from the `refresh-scene-baselines.yml` workflow artifact.
- A checkout path containing `scene-` routes every spec into the `scene-webgl` project: the `testMatch` regex is unanchored and matches the full path. Triage detail in vernacular-debugging-playbook.
- Re-running e2e after a rebuild without killing the old preview on 4173: `reuseExistingServer` keeps serving stale `dist/` bytes locally.
- Testing service worker behavior on `pnpm dev`: registration is PROD-gated and the worker file is only emitted by production builds.
- Letting release-please infer the version after any history surgery: check the tags are still reachable from `main` first, and reach for Release-As if not.
- Editing `vite.config.js` at the repo root: it is an emitted artifact of the `.ts` source. Full trap description in vernacular-build-and-env.

## Provenance and maintenance

All facts verified against the repo on 2026-07-05 (package.json version 0.3.1, `main` at 6b7d74c6). Re-verify before trusting:

- Ports and scripts: `grep -n '"dev"\|"preview"\|"storybook"\|"e2e"\|"stories:test"' package.json` plus `grep -n '4173\|6107' playwright.config.ts playwright.stories.config.ts lighthouserc.json`
- Harness modifiers and fixtures: `grep -n "SCENE_HARNESS_FIXTURE\|COLOR_TEMPERATURE_PARAM\|paint\|resolveHarnessScene" app/app.tsx` and `grep -n "HARNESS_ENVIRONMENT_STATES\|HARNESS_GEOMETRY_SCENE_KEYS" app/harness-environment.ts`
- Ready-frame contract: `grep -n "data-harness-ready" bridge/react/scene-harness-view.tsx e2e/tests/scene-solar.spec.ts`
- Harness render constants: `grep -n "HARNESS_WIDTH\|HARNESS_BACKGROUND\|forceWebGL" bridge/react/scene-harness-view.tsx`
- Scene baseline families: `ls e2e/tests/scene-visual-regression.spec.ts-snapshots/ e2e/tests/scene-solar.spec.ts-snapshots/`
- Project document names: `grep -n "PROJECT_FILE" storage/folder/folder-project-store.ts && grep -n "BUNDLE_SUFFIX" storage/zip/bundle-filename.ts`
- Current schema version: `grep -n "CURRENT_SCHEMA_VERSION" core/model/factories.ts && ls schema/`
- Artifact dirs still gitignored: `grep -n "dist/\|coverage/\|reports/\|storybook-static/\|playwright-report/\|test-results/\|lighthouseci" .gitignore`
- Service worker wiring: `grep -n "service-worker" vite.config.ts src/main.tsx`
- Release config: `cat release-please-config.json .release-please-manifest.json` and `git log --oneline -5 --grep="Release-As\|synchronize the release"`
- Cited ADRs exist: `ls docs/knowledge/decisions/ | grep -E "0045|0047|0117|0149|0150|0151|0152"`
