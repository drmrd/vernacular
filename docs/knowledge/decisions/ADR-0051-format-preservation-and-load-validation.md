---
slug: decisions/ADR-0051-format-preservation-and-load-validation
title: 'ADR-0051: Forward-compatibility preservation and load-time validation for the floor plan format'
type: decision
tags:
  [
    architecture,
    data-format,
    forward-compatibility,
    preservation,
    extensions,
    reserved-namespaces,
    schema,
    json-schema,
    validation,
    migrations,
    conformance,
    storage,
  ]
related:
  [
    decisions/ADR-0047-published-floor-plan-data-format-standard,
    decisions/ADR-0029-schema-registry-migration-framework,
    decisions/ADR-0034-future-direction-extensibility-seams,
    decisions/ADR-0028-directory-port-folder-storage-seam,
    decisions/ADR-0001-six-layer-architecture,
  ]
sourceFiles:
  [
    docs/specs/2026-06-10-vernacular-floor-plan-format.md,
    docs/plans/2026-06-11-vernacular-format-preservation.md,
  ]
status: current
updated: 2026-06-11
---

# ADR-0051: Forward-compatibility preservation and load-time validation for the floor plan format

## Status

Accepted. Implements sections 6.3, 6.4, 6.5, 7, and 8 of the Vernacular Floor Plan Format
specification (`docs/specs/2026-06-10-vernacular-floor-plan-format.md`), introduced by
[[ADR-0047-published-floor-plan-data-format-standard]]. The first format plan generated the CORE
schema and the `createDocumentValidator`; the file-rename plan adopted `vernacular.json` and
`*.building`. This decision covers the preservation round-trip, the validate-after-migration load
gate, and the optional Strict profile.

## Context

The format reserves three extension seams and a forward-compatibility rule: a processor must
preserve, byte-for-value, any `extensions` payload and any reserved key it does not understand across
a read-modify-write cycle (specification section 6.4), should run the CORE validator on app load
after migration as a non-fatal safety gate (sections 7 and 8), and may offer a Strict profile that
validates registered vendor namespaces against their schemas (sections 6.3 and 6.5).

Investigating the current codec produced a finding that shaped this decision: **preservation already
holds in practice.** `migrateProject` deep-clones the raw document and every migration spreads;
`dispatch` mutates the project root in place through a `Proxy`/`Reflect` and command handlers spread
entities; and `serializeProjectJson` is `JSON.stringify`. A load-edit-save cycle therefore round-trips
unknown top-level keys, nested reserved keys, and `extensions` payloads today. Forward-version
documents (a `schemaVersion` newer than this reader) are refused by `migrateProject`, which section 7
explicitly permits ("open it read-only or refuse").

That left a genuine architectural choice for the preservation requirement: rely on the implicit
structural guarantee, or add an explicit mechanism. The original framing posed two mechanism designs,
a passthrough carrier on the typed model versus a raw-document overlay in the codec.

## Decision

1. **Add a defensive preservation overlay in the storage codec, not a model carrier.** Even though
   the structural pipeline already preserves unknown data, the guarantee is implicit and could
   regress silently (for example if a future loader validated-and-stripped against the
   `additionalProperties: false` CORE schema). A single named backstop owns the guarantee:
   `storage/folder/preserve-unknown.ts` re-grafts, on save, any value the prior on-disk Document
   carried that the saved Document dropped. The overlay merges entity objects by key union (the saved
   value wins on shared keys; a previous-only key is restored), reconciles id-arrays by identity, and
   reconciles the keyed maps `roomOverrides` and `paint` by key, so deletions are never resurrected.
   It reads the prior `vernacular.json` at save time, so it is stateless and needs no app-lifecycle
   coupling.

   The rejected alternative, a typed carrier field on every entity, would add a non-domain member to
   the "small, honest CORE" the format prizes (and to the generated schema), and would have to be
   threaded through, or at least audited across, every command handler. The overlay keeps
   `core/model` and the CORE schema unchanged, so the drift guard stays green with no regeneration and
   no new dependency, and confines forward-compatibility to the codec layer that owns round-trip
   fidelity (ADR-0028).

2. **The load gate tolerates reserved keys.** `core/format/createTolerantValidator` runs the CORE
   validator and drops Ajv `additionalProperties` violations, and
   `core/format/createLoadValidationGate` reports the remaining CORE-shape issues without ever
   throwing. Because reserved and unknown keys are preserved by design, they must not surface as gate
   issues; filtering `additionalProperties` errors means a reported issue always signals a genuine
   shape break (a wrong type or a missing required field). Validation lives in `core/` per
   specification section 8 and is wired at the single app-load seam, not threaded through each storage
   wrapper.

3. **Ship the Strict profile now.** `core/format/createStrictValidator` validates the CORE schema and,
   additionally, validates each entity's `extensions` payloads whose reverse-DNS namespace is
   registered, against that namespace's schema; unregistered namespaces pass, and malformed
   reverse-DNS namespace keys are reported. The namespace-to-schema registry is an in-memory
   `ExtensionSchemaRegistry`.

## Consequences

- Forward-compatibility is now an explicit, tested contract rather than an emergent property, and
  cannot silently regress. The cost is one extra directory read per save (negligible for the
  in-memory, OPFS, and file-system stores) and a pure overlay module.
- `core/model` and `schema/<version>/vernacular.schema.json` are untouched, so `pnpm schema:check`
  needs no regeneration and no dependency is added (Ajv already ships with the validator).
- The load gate gives developers a non-fatal signal when a migrated Document fails CORE shape, while
  migrations remain the user-facing compatibility path; reserved and forward-compatible documents do
  not produce noise.
- The Strict profile gives a first home to vendor-namespace schema validation, ahead of the first
  registered namespace, so the open question in specification section 11 is resolved in favor of
  shipping the capability now. Forward-version documents stay refused on load; adding a read-only open
  path is a possible later enhancement.
- ADR-0047's note that preservation and validate-after-migration are "sequenced in later plans" is
  updated: they have landed here.

## References

- Specification: `docs/specs/2026-06-10-vernacular-floor-plan-format.md`, sections 6.3, 6.4, 6.5, 7, 8.
- Plan: `docs/plans/2026-06-11-vernacular-format-preservation.md`.
- [[ADR-0047-published-floor-plan-data-format-standard]],
  [[ADR-0029-schema-registry-migration-framework]],
  [[ADR-0028-directory-port-folder-storage-seam]].
  </content>
