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
- pnpm 9 or newer (see the `packageManager` field in
  [`package.json`](package.json)).

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

- **Commit messages** follow
  [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
  Common types we use: `feat`, `fix`, `refactor`, `docs`, `chore`,
  `test`, `style`. Mechanical enforcement via `commitlint` lands in
  Phase 0d.
- **Code style** is enforced by ESLint and Prettier. Run
  `pnpm lint` and `pnpm format:check` before pushing; `pnpm format`
  fixes most issues automatically. Stricter Clean Code rules
  (complexity caps, function length caps, layer-boundary rules) land
  in Phase 0d.
- **Tests** follow a behavior-first style: assert what the user
  experiences, not implementation details. The Vitest test in
  `src/App.test.tsx` is the current model. Red-green-blue TDD becomes
  a project-wide discipline in Phase 0c.
- **Documentation** changes that affect the architecture should also
  update an entry in `docs/knowledge/` once that directory exists
  (Phase 0c onward).

## Pull request checklist

Before requesting review, make sure:

- [ ] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
      passes locally.
- [ ] The PR description explains what changes and why, and includes a
      test plan.
- [ ] New user-visible strings (when we have them) go through
      `i18n.t()` (this becomes relevant from Phase 0g onward).
- [ ] You have read and accept the project's license terms (Apache-2.0;
      see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE)).

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
that will be documented in Phase 0d alongside the publishing CLI. Until
then, propose contributions of this kind as issues with samples.

## License

Vernacular is licensed under Apache-2.0. By contributing to this
project, you agree that your contributions will be licensed under
the same terms. Asset packs may declare their own SPDX licenses;
see the project specification for details.
