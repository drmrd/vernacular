# Project fixtures

Hand-authored `*.vernacular.json` files that exercise specific domain
configurations. Typical uses:

- Deterministic input for scene-graph derivation tests.
- Round-trip targets for the schema migration framework.
- Inputs for 3D scene snapshot tests once the engine layer exists.

Each fixture should have a comment at the top of the file (when the schema
permits) or a short note here that explains what it pins down.
