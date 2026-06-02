# Test fixtures

Static, reusable inputs that several tests can share. Each subtree below has a
narrow purpose; do not mix categories.

| Directory     | Holds                                                                              |
| ------------- | ---------------------------------------------------------------------------------- |
| `projects/`   | Hand-authored project JSONs that exercise specific domain configurations.          |
| `assets/`     | Tiny CC0 test assets (textures, models, audio if relevant) tagged with their SPDX. |
| `registries/` | Frozen registry snapshots used to pin schema and migration tests.                  |

Fixtures are append-only by convention: once a test depends on a fixture's
exact bytes, changes to that fixture invalidate the contract. Add a new
fixture rather than editing one in place; remove old fixtures only when no
test references them.

Do not import fixtures from production source; they belong to tests only.
