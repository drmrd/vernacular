# Implementation plan: Storybook story visual regression (#276)

Status: ready for RGB execution. Owner-approved approach (2026-06-20): Playwright screenshots
against a static Storybook build, with linux/amd64 baselines committed to the repo and generated
in docker so they match CI (ubuntu). No external service (Chromatic rejected: off-repo baselines,
external token, billing).

## Context and what already exists

- Stories already run as browser-mode component tests (chromium) via `@storybook/addon-vitest`
  under `pnpm storybook:test` (ADR-0105, ADR-0110). That harness renders + plays + a11y-checks but
  takes **no screenshots**. We do not change it.
- Existing Playwright visual-regression: `e2e/tests/scene-visual-regression.spec.ts` (WebGL scene)
  and `e2e/tests/visual-regression.spec.ts` (home page). Baselines live in
  `e2e/tests/<spec>.spec.ts-snapshots/` with a `-<platform>` suffix; global `maxDiffPixelRatio: 0.02`
  in `playwright.config.ts`; scene specs widen tolerance for GPU variance.
- `playwright.config.ts` projects: chromium / firefox / webkit / scene-webgl. `webServer` runs
  `pnpm preview --port 4173` (serves the app build, NOT storybook).
- Storybook scripts (`package.json`): `storybook dev -p 6006`, `build-storybook` -> `storybook-static/`.
  Story globs cover `app/ editor/ bridge/ src/` `**/*.stories.*`.
- CI (`.github/workflows/ci.yml`): `storybook-build` job on ubuntu installs chromium, runs
  `pnpm storybook:test` then `pnpm build-storybook`. No screenshot/baseline step.
- Docker is installed locally now (Colima + CLI, amd64 emulation verified). See
  memory `docker-installed-via-colima`.

Dependency note: #276 depends on #273 (DONE: the browser-mode harness) and #275 (story backfill,
IN PROGRESS via sub-issues #282-#286). Visual regression covers **whatever stories exist now**
(the ~11 backfilled design-system/shell stories + originals) and grows automatically as #275 lands,
because the spec enumerates stories from the built index rather than a hardcoded list.

## Architecture decisions

1. **A new Playwright project `stories`**, separate from the app e2e projects. testDir
   `e2e/stories/`, single spec `story-visual.spec.ts`. baseURL = the static storybook server.
2. **Serve `storybook-static` without a new dependency.** The 30-day cooldown forbids adding a
   server package casually. Write a tiny static-file server `scripts/serve-static.mjs <dir> <port>`
   (node `http` + `fs`, ~40 lines, correct MIME for .html/.js/.css/.png/.json) and point the
   Playwright `webServer` for the `stories` project at `node scripts/serve-static.mjs storybook-static 6107`.
   This server also gets a unit test.
3. **Enumerate stories from the built index.** `storybook-static/index.json` lists every entry;
   filter `entry.type === 'story'` (drop `docs`). A pure util `e2e/stories/story-index.ts`
   `readStoryIds(indexJsonText): string[]` parses + filters + sorts; unit-tested against a fixture.
   The spec visits `iframe.html?id=<id>&viewMode=story&args=` for each id.
4. **Baselines are linux-only, committed.** Force the snapshot suffix to `linux` regardless of host
   via `snapshotPathTemplate` on the `stories` project (e.g.
   `e2e/stories/__screenshots__/{arg}-linux.png`), because every baseline is generated in linux
   docker. A dev running this project on darwin will mismatch by design, so the project is **not run
   by the default local `pnpm e2e`**; it runs in CI (ubuntu) and via the docker update script.
5. **Determinism.** `toHaveScreenshot` with `animations: 'disabled'`, wait for the storybook root
   to be ready and fonts loaded (`document.fonts.ready`), full-page of the story root element. Start
   tolerance at `maxDiffPixelRatio: 0.01`; widen per-story only if a story proves flaky. Exclude any
   story that renders a live canvas/WebGL or is inherently nondeterministic via a small allowlist
   constant in the spec (none expected yet; bridge/scene stories do not exist until #286).
6. **Baseline generation = docker, linux/amd64.** Add `pnpm stories:update-snapshots` mirroring the
   existing `e2e:update-snapshots` docker flow: run the `stories` Playwright project with
   `--update-snapshots` inside a pinned `mcr.microsoft.com/playwright:<ver>-jammy` container with
   `--platform linux/amd64`, after `build-storybook`. Commit the resulting PNGs.
7. **CI gate.** In the `storybook-build` job, after `build-storybook`, run
   `pnpm exec playwright test --project stories` (no update) against committed baselines; upload the
   playwright-report (diffs) on failure. Stays on ubuntu, so it matches the committed linux baselines.

## RGB slices (each: RED test -> GREEN minimal -> BLUE review)

Run via the role-separated subagents from the MAIN thread (memory
`orchestrate-subagent-tdd-from-main-thread`). Tell each subagent the exact allowed files.

- **Slice 1 - static server.** `scripts/serve-static.mjs` + `scripts/serve-static.test.ts`:
  serves a file from a dir with correct content-type, 404s missing paths. (pure node, jsdom/unit)
- **Slice 2 - story index reader.** `e2e/stories/story-index.ts` `readStoryIds()` +
  `story-index.test.ts` against a small `index.json` fixture (one story + one docs entry -> only the
  story id; ids sorted).
- **Slice 3 - the visual spec + project wiring.** Add the `stories` project to `playwright.config.ts`
  (webServer = serve-static against storybook-static; snapshotPathTemplate fixes `-linux`).
  `e2e/stories/story-visual.spec.ts` reads ids and asserts `toHaveScreenshot` per story. Add
  `package.json` scripts `stories:test` and `stories:update-snapshots` (docker). Generate baselines
  via docker; commit them. This slice's "RED->GREEN" = baseline absent (spec fails / self-skips) ->
  baseline committed -> spec green. Prove it catches a change: temporarily tweak one component's CSS,
  confirm a diff failure, revert.
- **Slice 4 - CI gate.** Add the `playwright test --project stories` step to the `storybook-build`
  job in `ci.yml` with report upload on failure. (`build:`/CI change, exempt from rgb:audit.)

## Verification

- Local: `node` PATH set; `docker` PATH `/opt/homebrew/bin` + `colima start`. Build storybook,
  `pnpm stories:update-snapshots` (docker linux/amd64), then `pnpm stories:test` green; flip a CSS
  value to see a real diff; revert.
- Full gate before any push: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test &&
pnpm build`, plus `pnpm build-storybook` and the new `stories` project. rgb:audit on
  origin/main..HEAD (slices 1-3 must be test->feat->refactor; slice 4 is `build:`-exempt).

## Risks / open points

- **Baseline volume + churn.** One PNG per story (~14 today, growing toward ~80 as #275 lands).
  Acceptable; they are small. If review noise grows, consider grouping or a coarser tolerance.
- **Font rendering in docker vs CI ubuntu.** Both are linux; pin the same `playwright:<ver>-jammy`
  image the CI runner's browser matches, and ensure EB Garamond / Inter (Google Fonts) actually load
  in the static build, else mask text or self-host the fonts. Verify the first baseline visually.
- **amd64 emulation speed** on the arm64 dev box (qemu) is slow but only used for the occasional
  baseline refresh; CI generates/diffs natively on amd64.
- An ADR is warranted once this lands (visual-regression strategy + baseline-in-docker convention):
  **next free ADR = 0117.**
