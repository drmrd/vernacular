# Registry fixtures

Frozen snapshots of the `ElementTypeRegistry` and `FinishRegistry` used to
exercise schema migrations. Each snapshot is named with its schema version
(for example `registry-v3.json`) and is never edited; new versions arrive as
new files.

The migration framework reads these snapshots, applies the migration chain,
and compares against the expected post-migration shape. Do not delete a
snapshot until its corresponding migration is removed from the chain.
