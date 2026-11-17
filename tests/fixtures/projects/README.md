# Project fixtures

Hand-authored `*.vernacular.json` files that exercise specific domain
configurations. Typical uses:

- Deterministic input for scene-graph derivation tests.
- Round-trip targets for the schema migration framework.
- Inputs for 3D scene snapshot tests once the engine layer exists.

Each fixture should have a comment at the top of the file (when the schema
permits) or a short note here that explains what it pins down.

The `versions/` folder holds one stored document for each published schema
version, from 8 to the current one. Each is valid against its own
`schema/<N>/vernacular.schema.json` and carries every element kind that version
defines. They are the input for the migration chain, so they keep the shape and
the key formats the application wrote at the time rather than the current ones.
