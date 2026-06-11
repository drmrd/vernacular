# Schema artifacts

This directory holds the published JSON Schema for the Vernacular Floor Plan Format. The
normative specification is `docs/specs/2026-06-10-vernacular-floor-plan-format.md`; the decision
record is ADR-0047.

## Layout (target)

```
schema/
  <version>/
    vernacular.schema.json    generated CORE schema for that schemaVersion
```

`<version>` matches the project `schemaVersion` (read the live value from
`core/model/factories.ts`; it is 7 or later as integration work advances). Each version
keeps its own committed schema so older Documents validate against the schema they were written
for, and the migration chain moves a Document up to the current version before validation.

## How it is produced

The schema is generated from the TypeScript types in `core/model/`, which remain the single
source of truth. A build step (planned as `pnpm schema:generate`) emits the file above, and it
is committed as the published artifact. Continuous integration regenerates the schema and fails
on drift, so the committed schema and the types never diverge.

The generated schema is validated with a validator in `core/` (Ajv). The Core profile checks the
CORE schema and treats every `extensions` payload as an open object; an optional Strict profile
additionally validates registered vendor namespaces.

## `$id`

Each version's schema carries a stable, versioned `$id`. A resolvable hosting URL is optional; a
JSON Schema `$id` is an identifier first.

## Status

The generator, the validator, and the committed schema files are produced by the implementation
plan that follows this specification.
