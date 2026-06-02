---
slug: decisions/ADR-0005-command-pattern-undo
title: 'ADR-0005: Command pattern with framework-captured inverse'
type: decision
tags: [architecture, commands, undo-redo, mutation-discipline]
related: [decisions/ADR-0001-six-layer-architecture]
sourceFiles: [docs/specs/2026-06-01-vernacular-design.md]
status: current
updated: 2026-06-02
---

# ADR-0005: Command pattern with framework-captured inverse

## Status

Accepted. Implementation lands in Phase 0f.

## Context

A floor planner has many mutation surfaces (walls, openings, furniture, paint, trim, stairs, etc.). Undo and redo must work correctly across every one of them, including coalescing of continuous actions like a drag. Hand-writing matched do-and-undo pairs for every operation is error-prone; contributors often forget to update the undo path when they tweak the forward path.

## Decision

A single mutation boundary in `core/commands/dispatch.ts`. Every state change goes through `dispatch(command, projectState)`. Commands declare their `apply` logic only; the framework wraps that with an `InverseCapture` proxy that records every mutation, and the captured snapshot drives the automatic `revert` path. Custom `revert` is supported as an escape hatch but is rare.

Coalescing is opt-in via `coalesceWith(prev)`; drag operations declare themselves coalescable so the resulting undo history shows one entry per drag, not one per pointer event. Selection state lives outside the undo history.

## Consequences

- Contributors only write the forward path. The undo path is correct by construction.
- A single dispatch boundary is the natural place to add observability (audit log, telemetry once opt-in, structured logging in dev).
- Coalescing rules are explicit per command type rather than implicit timing windows.
- Persistence of the history with autosave snapshots becomes straightforward because commands are serializable.

## References

- Design specification, section 7.1 (Commands and undo/redo).
- Phase 0g (Hello-wall) will be the first place a real command flows through dispatch.
