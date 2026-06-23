---
slug: decisions/ADR-0104-unsaved-changes-guard-and-dirty-state-model
title: 'ADR-0104: Unsaved-changes guard and dirty-state model'
type: decision
tags:
  [
    architecture,
    dirty-state,
    unsaved-changes,
    guard,
    session,
    dispatch-boundary,
    autosave,
    beforeunload,
    open,
    import,
  ]
related:
  [
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0003-storage-provider-pattern,
    decisions/ADR-0019-bridge-dispatch-boundary,
    decisions/ADR-0119-write-ahead-crash-recovery,
  ]
sourceFiles:
  [
    docs/specs/2026-06-15-open-import-project.md,
    bridge/session/create-dirty-tracker.ts,
    bridge/session/discard-guard.ts,
    bridge/react/use-dirty-state.ts,
    bridge/react/use-autosave.ts,
    bridge/autosave/create-autosave.ts,
    app/use-before-unload-guard.ts,
    app/use-discard-confirmation.ts,
    app/use-workspace-state.ts,
    app/use-project-actions.ts,
    app/use-open-file-action.ts,
    editor/commands/save-command.ts,
    editor/shell/discard-dialog.tsx,
    editor/shell/project-menu.tsx,
    editor/shell/editor-shell.tsx,
  ]
status: current
updated: 2026-06-23
---

# ADR-0104: Unsaved-changes guard and dirty-state model

## Status

Accepted, landed. New, Open, Import, Open-Recent, and Open-Folder now check
whether the in-memory project has unsaved changes before they swap it. A dirty
project prompts a discard confirmation first, and closing or refreshing the tab
while dirty raises the browser's native leave warning. A fresh project, whether
from a New, an Open, an Import, or the boot load, starts clean.

Revised 2026-06-23. The dirty flag now clears on any successful canonical save,
not only an explicit one. Since the write-ahead change in ADR-0119, the debounced
autosave writes the real project to the store on every cycle, so a successful
autosave returns the project to a saved baseline and disarms the guard. An
explicit save still does the same; it moved off a dedicated header button onto a
Save item in the project menu and the Cmd+S (Ctrl+S elsewhere) shortcut, and it
pulses the save-status indicator to confirm the write. Both paths mark the saved
baseline by the revision they persisted, so an edit made while a save is in
flight stays dirty.

## Context

New, Open, and Import each replaced the in-memory project with no confirmation
and no undo. A single mis-click, or a file dropped on the canvas by accident,
silently threw away unsaved work, and there was no way back. Closing or
refreshing the tab gave no warning either. The codebase had no notion of "dirty
since the last explicit save" anywhere, so there was nothing for a guard to read.

The obvious shortcut was to reuse the autosave status. That status is the wrong
signal. Autosave writes a rolling snapshot on a debounce of roughly 500ms, so
`AutosaveStatus.saved` means a snapshot exists, not that the project matches the
last explicit save. Deriving dirtiness from autosave would report a project clean
about half a second after every edit, which would leave the guard inert exactly
when work is most at risk. The guard needs a baseline that only a real save moves:
originally an explicit save, or the adoption of a fresh project.

That premise shifted with the write-ahead change (ADR-0119). Autosave no longer
writes only a throwaway snapshot; each debounced cycle writes the canonical
project to the store, then prunes the snapshot. A successful autosave is now a
genuine save, the same write an explicit save performs. Leaving the guard armed
through every autosave then became its own problem: once the header Save button
was removed in favor of autosave, a project that autosaved cleanly still warned
on close, because nothing cleared the baseline. The revision-based marking below
lets a confirmed canonical save, whether autosave or explicit, clear the baseline
without losing an edit that lands mid-save.

## Decision

Track dirtiness off the dispatch boundary, keep it independent of the autosave
snapshot status, and route every destructive swap through one policy point.

**A framework-free dirty tracker.** `createDirtyTracker(session)` in
`bridge/session/create-dirty-tracker.ts` exposes `isDirty()`,
`subscribe(listener)`, `markSaved()`, and `dispose()`. It subscribes to
`EditorSession.subscribe`, the dispatch boundary (ADR-0019), as the one sound
source of "something changed": every mutation flows through `dispatch(command)`,
so a session notification is the signal that the project moved away from its
saved baseline. The tracker carries no React and no Three.js. A fresh session
(a New, an Open, an Import result, or the boot load) starts clean, because the
tracker's baseline is the session it was handed; `markSaved()` resets the
baseline to the current state, and `dispose()` detaches the session listener.

**A React adapter that resets per session.** `useDirtyState` and
`useDirtyTracker` in `bridge/react/use-dirty-state.ts` expose the reactive flag
through `useSyncExternalStore`. `useDirtyTracker` memoizes a tracker on the
session reference, so a swap hands it a new session and the hook builds a new
tracker. The clean baseline resets for free on every swap, and the hook returns
the live `isDirty` flag together with a stable `markSaved`.

**A pure policy seam.** `bridge/session/discard-guard.ts` holds the
destructive-op policy as plain functions, with no DOM and no React. The
`needsDiscardConfirmation(isDirty)` predicate decides whether a confirmation is
owed, and the `guardDestructive({ isDirty, confirm, run })` runner ties the
predicate, the confirm prompt, and the action together: a clean project runs the
action directly, a dirty project confirms first and runs only on a yes. Keeping
the policy here makes it unit-assertable without a DOM and reusable by later C4
issues without touching the call sites.

**App-layer wiring.** The destructive handlers (New, Open, Import, Open-Recent,
Open-Folder) route through `guardDestructive` before they swap, in
`app/use-project-actions.ts` and `app/use-open-file-action.ts`, with
`app/use-workspace-state.ts` and `app/use-discard-confirmation.ts` assembling
the tracker, the confirm prompt, and the handlers. A `DiscardDialog`
(`editor/shell/discard-dialog.tsx`, `role="alertdialog"` with an
`aria-labelledby` message) presents the confirm and cancel choices.
`useBeforeUnloadGuard(isDirty)` in `app/use-before-unload-guard.ts` arms the
browser's native leave warning while the project is dirty and disarms it
otherwise. `markSaved()` is called on an explicit-save success (the
`commitProject` path) and, implicitly through the per-session tracker, on every
fresh-session adoption.

**Revision-based saved marking (revised 2026-06-23).** The tracker counts the
mutating dispatches it has seen and exposes that count as `revision()`. Marking a
save records the revision it persisted: `markSavedRevision(rev)` raises the saved
baseline to that revision, and `markSaved()` is now just
`markSavedRevision(revision())`. The clean test stays "saved baseline equals
current revision", so a later edit advances the count past the baseline and the
project reads dirty again.

This is what lets autosave and an explicit save share one disarm path without a
race. A save reads `revision()` at the moment it begins, before the asynchronous
write, and calls `markSavedRevision(thatRevision)` only when the write succeeds.
If an edit arrives while the write is in flight, the live revision advances past
the captured one, so marking the captured revision leaves the project dirty and
the new edit is not silently dropped. Autosave (`bridge/autosave/create-autosave.ts`,
`bridge/react/use-autosave.ts`) reports the revision it wrote through an `onSaved`
callback, and the explicit save (`app/use-project-actions.ts`) captures the
revision the same way; `app/use-workspace-state.ts` wires both to the dirty
tracker's `markSavedRevision`.

The explicit save reaches the user two ways now that the header Save button is
gone: a Save item in the project menu (`editor/shell/project-menu.tsx`) and a
`Mod+S` command (`editor/commands/save-command.ts`) registered in the editor's
keybinding layer. The save status state moved up to `app/use-workspace-state.ts`
so both autosave and the explicit save report into one indicator; on a successful
explicit save the action pulses that indicator to "saved", so Cmd+S confirms the
write rather than appearing to do nothing.

This slice changed no `docs/specs/` file: it adds a safety guard around the
existing open and import flows rather than a new file format or a spec change,
so there is no spec-change ADR companion. The behavior it guards is the one the
open and import specification already describes.

## Consequences

- A destructive swap on a dirty project now prompts before it discards, and a
  tab close or refresh while dirty raises the native warning, so a mis-click or
  a stray dropped file no longer silently loses work.
- Dirtiness is read off the dispatch boundary, not off the autosave status flag.
  The clean baseline is a confirmed canonical save, identified by the revision it
  wrote: the explicit save (`commitProject`), a successful autosave (the
  write-ahead store write from ADR-0119), and a fresh load or swap. The guard
  stays armed through the debounce window until a save actually completes, and an
  edit that lands while a save is in flight keeps the project dirty.
- The policy lives at one point. `needsDiscardConfirmation` and
  `guardDestructive` are unit-tested without a DOM, and the call sites name the
  predicate and the runner rather than re-deriving the rule, so a later change to
  the policy lands in one place.
- This is the foundation for the rest of the C4 work, and each follow-up extends
  the same seam without touching the call sites. Issue #232 (crash recovery)
  consults `isDirty()` to gate recovery, issue #233 (file-operation error
  states) extends the `guardDestructive` runner with failure branches, and issue
  #262 (storage-degraded warning) adds a reason to the same confirm surface.
- The tracker is rebuilt per session, so a swap resets the baseline for free.
  This relies on the workspace handing the hook a new session reference on each
  swap: the React adapter keys the tracker on the session reference, so a session
  mutated in place without a new identity would not reset the baseline.

## References

- Specification: `docs/specs/2026-06-15-open-import-project.md` (the open and
  import flows this guard wraps; unchanged by this slice).
- ADR-0019 (the editor session as the bridge dispatch boundary, the single
  source the dirty tracker subscribes to).
- ADR-0003 (the storage provider pattern behind `commitProject`, the explicit
  save that sets the clean baseline).
- ADR-0119 (the write-ahead autosave that turned each debounced cycle into a
  canonical store write, so a successful autosave now clears the dirty baseline).
- ADR-0001 (the six-layer architecture: the tracker and guard stay
  framework-free in `bridge/`, the dialog lives in `editor/`, and the wiring
  lives in `app/`).
