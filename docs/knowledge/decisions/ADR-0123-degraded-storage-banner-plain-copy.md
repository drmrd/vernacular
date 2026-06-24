---
slug: decisions/ADR-0123-degraded-storage-banner-plain-copy
title: 'ADR-0123: Degraded-storage banner uses plain user-facing copy'
type: decision
tags: [storage, notifications, banner, copy, accessibility]
related: [decisions/ADR-0118-notification-subsystem]
sourceFiles: [app/use-degraded-storage-banner.ts, storage/storage-capabilities.ts]
status: current
updated: 2026-06-24
---

# ADR-0123: Degraded-storage banner uses plain user-facing copy

## Status

Accepted, landed. The warning banner shown when no durable storage backend is available carries one
plain sentence about the consequence rather than a technical capability summary.

## Context

When the app boots, it probes for a durable place to keep projects. If neither OPFS nor IndexedDB is
usable (`isStorageDegraded` in `storage/storage-capabilities.ts`), work cannot survive a reload, and
the editor raises a dismissible warning banner so the person is not surprised later.

The notification-subsystem specification (`docs/specs/2026-06-21-notification-subsystem.md`) first
described that banner's text as "built from `summarizeStorageCapabilities`." That helper enumerates
which storage APIs answered and which did not. It reads like a line from a diagnostic log: useful when
you are debugging why persistence failed, wrong as the first thing a person sees when they open the
app. It names mechanisms (OPFS, IndexedDB) the audience has no reason to know, and it never says the
consequence the person cares about: their work will not be kept.

## Decision

The banner carries a single plain sentence written in the reader's terms:

> Storage is unavailable, so your work will not be saved between sessions.

`summarizeStorageCapabilities` stays in the storage layer for logs and diagnostics, but it no longer
feeds user-facing banner copy. The two audiences are different: a banner speaks to the person using the
editor, a capability summary speaks to whoever is reading the console.

The specification is updated to match this as-built behavior. This ADR is the record the specification
change points to, per the project rule that a spec edit travels with a decision record.

## Consequences

- The banner text is decoupled from the capability probe. Adding or renaming a backend probe later does
  not silently reshape what the person reads.
- A power user no longer learns from the banner itself which backend failed. That detail still exists,
  in the console diagnostics, where someone investigating a persistence problem will look for it.
- If a future design wants the banner to offer a remedy (for example, a hint about leaving private
  browsing), it extends this plain-language sentence rather than surfacing the raw capability list.
