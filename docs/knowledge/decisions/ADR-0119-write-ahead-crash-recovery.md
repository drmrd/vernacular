---
slug: decisions/ADR-0119-write-ahead-crash-recovery
title: 'ADR-0119: Write-ahead crash recovery'
type: decision
tags: [storage, crash-recovery, autosave, snapshot, opfs, persistence, app-shell]
related:
  [
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0042-underlay-asset-persistence,
    decisions/ADR-0104-unsaved-changes-guard-and-dirty-state-model,
    decisions/ADR-0022-storage-capability-detection,
  ]
sourceFiles:
  [
    bridge/autosave/create-autosave.ts,
    app/resolve-snapshot-store.ts,
    app/opfs-probe.ts,
    app/use-resolved-snapshots.ts,
    app/app.tsx,
    src/main.tsx,
    storage/snapshots/snapshot-store.ts,
    app/use-project-actions.ts,
  ]
status: current
updated: 2026-06-23
---

# ADR-0119: Write-ahead crash recovery

## Status

Accepted, landed. Autosave now writes a recovery snapshot, saves the canonical project, then prunes the
snapshot, in that order. A plain reload restores the latest edit silently from the canonical store. A
snapshot that outlives its cycle, which only happens when the cycle was interrupted, makes the next boot
offer to recover the unsaved work.

## Context

Crash recovery shipped as machinery but never ran for real users. The `SnapshotStore`, the recovery
prompt, and the autosave hook all existed, but the production entry point rendered the app without a
snapshots port, so recovery was inert and the recent-projects list fell back to an in-memory store that
reset on every reload.

The obvious way to switch recovery on had a catch. Autosave chose between two persistence targets with a
single ternary: with a snapshots port present it called `writeSnapshot` and nothing else, otherwise it
called `store.save`. So handing the production app a snapshots port did more than enable recovery. It
moved every autosave off the canonical store and into a recovery sidecar. The canonical store would then
only advance on an explicit Save, which meant a plain reload stopped restoring the latest edit, and
because `isRecoverable` is true whenever any rolling snapshot exists, the recovery prompt would appear
after every reload that followed an unsaved edit. The "All changes saved" readout would no longer mean
the work survived a reload. That is a worse experience than the one already shipping, where autosave
writes straight to durable storage and a reload quietly brings the work back, and it runs against the
direction of #247, which is to drop the explicit Save button rather than lean on it.

The work, then, was to add a crash safety net without giving up the silent restore the app already had.

A second constraint came from the boot path. The OPFS snapshot store cannot be built synchronously: it
probes storage capabilities and confirms the OPFS root resolves before it commits to that backend
(ADR-0042, ADR-0022). An earlier attempt resolved it in the entry point and awaited it before the first
render, which delayed the first paint and left the page blank long enough that an accessibility check ran
against an empty document.

## Decision

Autosave writes ahead. When a snapshots port is present, a debounced cycle writes the recovery snapshot
first, then saves the canonical project store, then prunes the snapshot once the canonical write resolves.
The snapshot is a write-ahead log entry, not a parallel save: it exists only for the moment between
writing it and pruning it, and prune runs only after the canonical save succeeds. With no snapshots port
the behavior is unchanged, a single `store.save`.

This keeps the canonical store current on every edit, so a plain reload restores silently exactly as
before. A snapshot survives only when a cycle wrote it but did not reach the prune, which means the
canonical save was interrupted partway. That is a crash. On the next boot `isRecoverable` finds the
surviving snapshot and the app offers to recover it; a clean shutdown leaves nothing behind and the boot
is silent. The explicit Save path is untouched, since it already saved the canonical project and pruned
the snapshots.

The persistence strategy is resolved once when the autosave is constructed, into a single write function
that `persist` closes over, rather than re-deciding on every debounce. The choice is the same on every
cycle, so it is made once.

The snapshot store resolves off the first paint. The entry point passes a `resolveSnapshots` thunk rather
than a ready port, and a `useResolvedSnapshots` hook runs it once after mount and lands the result in
state on a later render. The app shell paints immediately with no snapshots port, and recovery comes
online a beat later when the thunk settles. A synchronously available port, which tests inject directly,
is returned as-is and skips the thunk, so the async path is the production path only. Recovery stays
scoped to OPFS: on the IndexedDB fallback there is no durable directory for the `.house-autosave` sidecar,
so the resolver returns nothing and recovery stays off there.

### Rejected: snapshots replace the canonical save

Letting autosave write only the snapshot, with the canonical store advancing on explicit Save, is the
shape the machinery was first built for. It is rejected because it regresses the experience already
shipping. Silent restore goes away for anyone who does not press Save, the recovery prompt fires on every
reload after an edit, and the save readout stops telling the truth. Write-ahead keeps the canonical store
as the source of truth and demotes the snapshot to a crash log, which is the only role it needs.

### Rejected: block the first paint on snapshot resolution

Resolving the snapshot store in the entry point and awaiting it before rendering is simpler to read, but
it delays the first paint behind a storage probe and an OPFS handle. The app should draw its shell first
and bring recovery online afterward, because nothing about the first frame depends on whether a snapshot
exists. The thunk-and-hook split buys that at the cost of one extra render.

## Consequences

- A plain reload restores the latest edit silently, with no recovery prompt, because the snapshot is
  pruned on every successful save. The prompt is now a true crash signal rather than routine noise.
- The canonical store advances on every autosave, so recovery is a safety net layered on top of durable
  saving rather than a replacement for it. The marginal protection it adds is the in-flight edit and a
  torn canonical write, which is what a write-ahead log is for.
- The snapshots port that autosave receives now needs `prune` as well as `writeSnapshot`, since a cycle
  both writes and clears. The type carries both.
- Recovery is OPFS-only by construction. On the IndexedDB fallback the resolver returns nothing, so the
  prompt never appears there. If a durable sidecar location for that backend ever exists, the resolver is
  the one place to extend.
- The first paint never waits on storage. Anyone wiring another durable port into the entry point should
  resolve it off the first render the same way, not await it before `createRoot`.
- A failed canonical save keeps the snapshot and reports an error, so the unsaved work stays recoverable
  and the next successful cycle prunes it.

## References

- ADR-0001 (the layer boundaries that keep this wiring at the React and storage seams).
- ADR-0042 (the OPFS store-and-asset pairing the snapshot resolver reuses to stay OPFS-only).
- ADR-0022 (the storage-capability detection the resolver probes before committing to OPFS).
- ADR-0104 (the unsaved-changes guard whose confirm seam the recovery prompt's Discard reuses).
- Issues: #232 (recovery and durable recents wired off in production), #247 (the Save-versus-autosave
  direction this keeps room for).
