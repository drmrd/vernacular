# Test factories

Each factory exports a `make*` function that returns a fresh, fully-typed
domain object useful for tests. Conventions:

- One factory file per domain type. File name matches the factory name in
  camelCase plus `.ts`: `makeWall.ts`, `makeProject.ts`, `makeOpening.ts`.
- Each `make*` accepts an optional `Partial<T>` and spreads it over sensible
  defaults so individual tests can override exactly the fields they care
  about.
- Factories never share mutable state between calls; every call returns a
  fresh object.
- Property-based tests provide their own random fixtures via fast-check.
  Factories serve example-based tests.

This directory is empty by design until the `core/` layer introduces the
domain types it produces. Adding a factory here without a corresponding
domain type makes the factory's return type fictional; defer factories until
they have something real to instantiate.
