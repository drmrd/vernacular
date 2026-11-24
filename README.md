# Vernacular

Open-source floor planner for power users, with first-class support for
historic and period-vernacular architecture. Built for owners and enthusiasts
of houses that mainstream floor planners don't represent well: Victorian,
Edwardian, Craftsman, Mid-Century, and earlier.

> Status: early alpha. The 2D editor and 3D preview are usable; data formats
> and APIs may change without backwards compatibility before 1.0 (releases in
> [`CHANGELOG.md`](CHANGELOG.md)).
> See [`docs/specs/2026-06-01-vernacular-design.md`](docs/specs/2026-06-01-vernacular-design.md)
> for the design specification and [`docs/plans/`](docs/plans/) for in-progress
> implementation plans. The current work and what's next are tracked on the
> [delivery roadmap board](https://github.com/users/drmrd/projects/3); the
> strategy and track model are in
> [`docs/delivery-strategy.md`](docs/delivery-strategy.md).

## Documentation map

- [`ARCHITECTURE.md`](ARCHITECTURE.md): one-page overview of the seven-layer
  codebase and where to find things.
- [`docs/delivery-strategy.md`](docs/delivery-strategy.md): delivery strategy and
  track model. Live per-item status is on the
  [delivery roadmap board](https://github.com/users/drmrd/projects/3).
- [`CONTRIBUTING.md`](CONTRIBUTING.md): contribution workflow, dev setup,
  conventions.
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md): community standards.
- [`SECURITY.md`](SECURITY.md): how to report security issues.
- [`CHANGELOG.md`](CHANGELOG.md): notable changes per release.
- `docs/specs/`: authoritative design specifications.
- `docs/plans/`: per-phase implementation plans.

## Development

Prerequisites:

- Node.js 22.18+ (see `.nvmrc` and `engines` in `package.json`)
- pnpm 10+ (the version is pinned via `packageManager` in `package.json`;
  using corepack means you do not need to install pnpm yourself)

```sh
pnpm install
pnpm dev        # start dev server (http://localhost:5173)
pnpm test       # run unit tests
pnpm typecheck  # TypeScript type check
pnpm lint       # ESLint
pnpm build      # production build to dist/
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full contribution flow.

## Free, and stays free

Every feature of Vernacular is free, and the code stays under Apache-2.0. Your projects always
export in the open `.building` format, with no account. You may host every service the app talks
to yourself. The default library never shows a paid item, a price, a locked item, an upsell, or an
advertisement, and a published asset never loses rights. The full commitment is in
[ADR-0230](docs/knowledge/decisions/ADR-0230-vernacular-is-free-software-and-stays-free.md).

## License

Apache-2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
