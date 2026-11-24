---
slug: decisions/ADR-0230-vernacular-is-free-software-and-stays-free
title: 'ADR-0230: Vernacular is free software and stays free'
type: decision
tags: [commitment, licensing, open-format, assets, self-hosting, privacy]
related:
  [
    decisions/ADR-0047-published-floor-plan-data-format-standard,
    decisions/ADR-0229-one-library-over-a-shared-hash-addressed-asset-store,
  ]
sourceFiles:
  [
    LICENSE,
    README.md,
    .claude/rules.md,
    docs/specs/2026-06-10-vernacular-floor-plan-format.md,
    core/assets/license-policy.ts,
  ]
status: current
updated: 2026-11-21
---

# ADR-0230: Vernacular is free software and stays free

## Status

Current. The project owner made this commitment on 2026-11-21. It binds every specification,
decision record, and change in the project.

## Context

Vernacular is licensed under Apache-2.0. It stores projects in an openly specified format
(ADR-0047), and section 2.3 of its design specification says the application sends no telemetry
by default. No document yet says that it needs no account, and the promises that do exist are
spread over separate documents. ADR-0229 adds the first service the application talks to, a store
of furniture and textures. People who use the application, and people who deploy it, need one
place that says what they can rely on.

## Decision

The points below are invariants of the design. A change that breaks one is rejected.

In this record, "free" means at no charge. The title also means free software in the usual sense:
Apache-2.0 lets anyone run, study, change, and share the code. A free asset is one published under
a license on the allowlist of `core/assets/license-policy.ts`. The default library is what a person
sees before adding a catalog or a pack: the bundled starter set and the catalog the deployment is
configured with.

The points of this record bind the project's own code, its own catalog, and its default
configuration. Apache-2.0 lets anyone deploy a changed copy, and this record does not bind what
they ship.

### The software

1. The code stays under Apache-2.0.
2. Every feature of the software is free. No feature, import, export, or file format is ever held
   back for payment.
3. Using the application and its free assets never requires an account, and never requires
   telemetry. Any diagnostics stay opt-in, as section 2.3 of the design specification states.

### Projects

4. A project belongs to the person who made it. It always exports in the openly specified format:
   the `.building` archive and its `vernacular.json`, defined in
   [`docs/specs/2026-06-10-vernacular-floor-plan-format.md`](../../specs/2026-06-10-vernacular-floor-plan-format.md)
   and decided in ADR-0047. Exporting needs no account.

### Services

5. Anyone may host every service the application talks to. The layout of each service is
   documented, and its address is a setting. The application works with a self-hosted copy as it
   does with the project's own.

Anyone may offer a hosted copy of such a service, including for a charge, while self-hosting it
stays free and the application works the same with a self-hosted copy.

### Assets

6. A published free asset stays free. A license change may only grant more rights, never remove
   one. An asset leaves the project's catalog only for a legal reason or a defect.
7. If paid content ever exists, it is only 3D models, textures, and their thumbnails. Nothing that
   changes what the application can do is ever paid. Construction and trim profiles, element types,
   eras, palettes, translations, schemas, and all code stay free.
8. The default library never shows a paid item, a price, a locked tile, an upsell, or an
   advertisement. Paid content, if it ever exists, could only come from a separate catalog that a
   user adds on purpose.

### Changing this record

Only a later decision record written for that purpose changes this one. No other design changes it
as a side effect. A later record cannot take back what is already released. Released code keeps
its Apache-2.0 license, and a published asset keeps every right it was published with.

## Consequences

- Every specification, decision record, and change is read against this record. `.claude/rules.md`
  lists it as a hard invariant, and reviewers reject a change that breaks it.
- `README.md` states the commitment in short form and links here.
- ADR-0229 and the asset distribution specification rely on this record and do not restate it.
- Today the application reads only packs whose every asset carries a license on the allowlist.
  That is the design of ADR-0229, not a point of this record.

## References

- `docs/specs/2026-06-10-vernacular-floor-plan-format.md`
- `docs/specs/2026-06-01-vernacular-design.md`, section 2.3
- `docs/specs/2026-11-21-asset-pack-distribution.md`
- [[ADR-0047-published-floor-plan-data-format-standard]]
- [[ADR-0229-one-library-over-a-shared-hash-addressed-asset-store]]
