# Contributing to Vernacular

Thanks for your interest in contributing. Vernacular is an open-source
floor planner aimed at power users, with a heavy lean toward homes that
mainstream floor planners do not represent well. We are in early Phase
0 development; the surface is small and the bar for help is correspondingly
low. Issues, design feedback, contributor packs (assets, registries),
and code contributions are all welcome.

## Before you start

- Read [`README.md`](README.md) for the quick orientation.
- Read [`ARCHITECTURE.md`](ARCHITECTURE.md) for the layer overview.
- The authoritative design lives at
  [`docs/specs/2026-06-01-vernacular-design.md`](docs/specs/2026-06-01-vernacular-design.md).
  Skim the table of contents at least.
- The current phase and what is coming next are in
  [`ROADMAP.md`](ROADMAP.md).
- All contributors are expected to follow the
  [Code of Conduct](CODE_OF_CONDUCT.md).
- Security concerns go through the disclosure path in
  [`SECURITY.md`](SECURITY.md), not public issues.

## Development setup

Prerequisites:

- Node.js 20 or newer (see [`.nvmrc`](.nvmrc)).
- pnpm 10.33 or newer (see the `packageManager` field in
  [`package.json`](package.json)). If you have corepack enabled (it
  ships with Node 16+), running any `pnpm` command in this repository
  will activate the correct version automatically.

Clone the repository, install dependencies, and verify the local check
chain:

```sh
git clone git@github.com:drmrd/vernacular.git
cd vernacular
pnpm install
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

Run the dev server with `pnpm dev`. The smoke test in
`src/App.test.tsx` is the only test in the repository today.

## How to file an issue

- Search [open issues](https://github.com/drmrd/vernacular/issues) first
  to avoid duplicates.
- Provide enough context to reproduce: operating system, browser,
  Node and pnpm versions, and what you ran. Screenshots help.
- For ideas and feature proposals, label your issue as a discussion
  and describe the problem before the proposed solution.

## How to propose a change

1. Fork the repository (or, if you have write access, create a feature
   branch directly).
2. Name the branch descriptively. The convention used so far is
   `feat/<scope>-<short-description>` or `fix/<scope>-<short-description>`
   for code changes, and `docs/<short-description>` for documentation.
3. Write your change. See "Conventions" below.
4. Open a pull request against `main`. Fill in the PR description with
   a clear summary and a test plan.
5. Wait for CI to go green and for review.

Small, focused PRs are easier to review and merge. If your work is
large, open an issue first to discuss scope and possibly split into
multiple PRs.

## Conventions

These will tighten in later phases as the tooling lands. Current state:

- **Dependency cooldown.** This repository enforces a 15-day minimum
  release age on every direct and transitive dependency (configured in
  [`.npmrc`](.npmrc) as `minimum-release-age=21600`). If you add or
  bump a dependency to a version that was published within the last 15
  days, `pnpm install` will refuse the install. Pin to an older
  patch/minor or wait the cooldown out. This is a supply-chain safety
  measure: malicious package releases are usually caught and yanked
  within days, so the cooldown filters out the highest-risk window.
- **Commit messages** follow
  [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
  Common types we use: `feat`, `fix`, `refactor`, `docs`, `chore`,
  `test`, `style`. Mechanical enforcement via `commitlint`.
- **Code style** is enforced by ESLint and Prettier. Run
  `pnpm lint` and `pnpm format:check` before pushing; `pnpm format`
  fixes most issues automatically. The Clean Code rule set (function
  length, parameter count, cyclomatic complexity, nesting depth,
  layer boundaries, naming convention, unused imports) lands as
  warnings or errors per `eslint.config.js`. Test files relax
  `no-magic-numbers` and lift the function-length cap so literal
  expectations remain natural.
- **Duplicate detection.** Run `pnpm dup` for a jscpd duplicate
  report. The configured threshold is informational (no CI fail);
  use the report to spot refactor opportunities.
- **Tests** follow a behavior-first style: assert what the user
  experiences, not implementation details. The Vitest test in
  `src/App.test.tsx` is the current model. Red-green-blue TDD is the
  project-wide discipline for application code.

## Pull request checklist

Before requesting review, make sure:

- [ ] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
      passes locally.
- [ ] `pnpm e2e --project=chromium` passes locally (or note that baselines need a CI refresh in your PR description).
- [ ] The PR description explains what changes and why, and includes a
      test plan.
- [ ] New user-visible strings (when we have them) go through
      `i18n.t()` (this becomes relevant once the editor surface lands).
- [ ] You have read and accept the project's license terms (Apache-2.0;
      see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE)).
- [ ] If your change touches `core/`, run `pnpm mutate:check` locally to confirm the Stryker scaffold still configures cleanly (a full `pnpm mutate` run is not required; the weekly CI workflow owns that).

## Reviewing pull requests

Maintainers and other contributors are welcome to review. When you
review:

- Read the diff before reading the description so you form your own
  understanding.
- Be specific. Point at lines, propose alternatives, ask questions.
- Distinguish blocking comments from suggestions. Use the GitHub
  "Request changes" review type sparingly, and only for issues that
  must be addressed before merging.

## Asset and registry contributions

Asset packs (3D models, textures, color palettes) and registry packs
(element types, eras, trim profiles) ship through a separate workflow
that will be documented alongside the publishing CLI. Until then,
propose contributions of this kind as issues with samples.

## Hooks and release engineering

Husky installs three git hooks at `pnpm install` time via the `prepare` script:

- `pre-commit`: runs `lint-staged` on staged files (ESLint plus Prettier).
- `commit-msg`: runs `commitlint` over your commit message. Conventional Commits are enforced; non-conforming messages are rejected.
- `pre-push`: runs the full local check chain (`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`).

If you need to bypass a hook in a clean-up situation, use `git commit --no-verify`. This is allowed but discouraged; CI will catch most issues that the hook would have.

`release-please` watches `main` and opens release PRs as Conventional Commits accumulate. Merging a release PR cuts a tag and refreshes `CHANGELOG.md`. The current pre-release version is tracked in `.release-please-manifest.json`; the package.json `version` stays at `0.0.0` until the first 1.0.

## Storybook

The component visual documentation surface runs on [Storybook](https://storybook.js.org/) with the `@storybook/react-vite` framework. Start the dev server with `pnpm storybook` (default port `6006`) and build a static deployable copy with `pnpm build-storybook` (output in `storybook-static/`, gitignored).

Each new presentational component should ship with at least one story (`*.stories.tsx` next to the component) covering the default state. Stories double as visual baselines for later phases of the visual-regression suite.

## End-to-end testing

Cross-browser E2E tests use [Playwright](https://playwright.dev/) configured for Chromium, Firefox, and WebKit. Tests live under `e2e/tests/`.

Common commands:

- `pnpm e2e` runs every Playwright test against every configured browser project.
- `pnpm e2e --project=chromium` scopes a run to Chromium (the CI default for PRs).
- `pnpm e2e:ui` opens Playwright's interactive UI runner for local debugging.

Accessibility coverage uses `@axe-core/playwright`: each navigation in an E2E test should pair with an axe scan (see `e2e/tests/accessibility.spec.ts` for the pattern). Treat any new violation as a build break: fix the underlying source, do not weaken the assertion.

### Visual regression baselines

`toHaveScreenshot` baselines are committed under `e2e/tests/visual-regression.spec.ts-snapshots/`. Playwright defaults to per-platform baselines (`*-darwin.png`, `*-linux.png`, `*-win32.png`) so each contributor's OS gets its own committed baseline. The macOS baseline is checked in; CI generates and commits the Linux baseline on its first run via a manually-dispatched workflow (or a follow-up PR).

To regenerate a baseline locally after an intentional UI change:

```sh
pnpm e2e --update-snapshots=missing --project=chromium
```

Review the regenerated PNG before committing.

## Performance budgets

[Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) measures Vernacular's production bundle against category-level budgets:

- Accessibility is a hard gate (minimum score 0.9). Lighthouse and `@axe-core/playwright` should agree; if they disagree, treat both reports as data and fix the source.
- Performance, best-practices, and SEO are warn-only at this stage. Tighten them as real user surfaces arrive.

Local commands:

- `pnpm build` (Lighthouse measures the production preview, so a build is a prerequisite).
- `pnpm lhci` runs three Lighthouse passes against the preview, prints assertions, and exits non-zero on any error-level violation.

CI runs Lighthouse on pushes to `main` and on tag pushes; the per-PR loop intentionally skips it to keep iteration fast.

## Mutation testing

[Stryker](https://stryker-mutator.io/) runs weekly against `core/` and measures test quality. A mutation that survives means the tests do not catch the breakage Stryker introduced; treat surviving mutants as a backlog of missing tests rather than as a complaint about Stryker.

Local commands:

- `pnpm mutate:check` verifies the Stryker config without running mutants.
- `pnpm mutate` runs the full mutation suite. This is slow; expect it to take many minutes once `core/` has real code.

CI runs Stryker on a weekly schedule (`.github/workflows/mutation.yml`) and on manual dispatch. The workflow skips cleanly when `core/` is empty.

## Working with Claude Code

This repository ships project-local subagents (`.claude/agents/`) and slash commands (`.claude/commands/`) that automate the red-green-blue TDD workflow. If you are contributing through Claude Code, the typical cycle is:

1. Stage and read the relevant ADRs and any open spec for context.
2. `/test-first "<behavior in plain English>"` writes a single failing test.
3. `/implement` writes the minimal implementation to make the test pass.
4. `/clean-code-review` audits the diff.
5. `/refactor` applies the audit findings (or creates an empty BLUE marker commit when nothing actionable came out).
6. Repeat for each behavior in the feature.
7. `/review` performs the pre-merge audit on the entire branch.

If you are contributing without Claude Code, the same discipline applies: write the failing test first, commit it; write the minimal implementation, commit it; apply Clean Code improvements while keeping tests green, commit them. See `CLAUDE.md` and `.claude/rules.md` for the rubric.

## License

Vernacular is licensed under Apache-2.0. By contributing to this
project, you agree that your contributions will be licensed under
the same terms. Asset packs may declare their own SPDX licenses;
see the project specification for details.
