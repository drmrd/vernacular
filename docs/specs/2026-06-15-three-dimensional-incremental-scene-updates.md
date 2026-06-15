# Incremental scene updates in the three-dimensional preview

Date: 2026-06-15

## Problem

The three-dimensional preview rebuilds its entire scene on every project edit. The
view subscribes to the live scene graph, scopes it to the active floor, and feeds that
to `buildFramedScene`, which constructs all of the floor's Three.js geometry, resolves
its paint materials, draws the edge overlay, flags shadow casters, clones the near-wall
materials, and frames the camera. The consumer wraps that in a `useMemo` keyed on the
scoped graph and the paint.

Two things make this fire far more often than the scene actually changes. The scoping
helper returns a fresh object on every call, so the memo's key changes whenever any part
of the project changes. And the project's scene graph is one shared snapshot, so an edit
on a floor that is not being shown still produces a new snapshot. The upshot: editing one
floor rebuilds the preview of a different floor, switching back to a floor that did not
change rebuilds it from scratch, and a project change that does not touch the shown floor
at all still tears down and rebuilds its scene and jumps the camera.

The preview foundation named a seam for this (foundation specification section 5.5): the
first slices may rebuild wholesale, and a later slice replaces the internals behind the
seam without changing the consumer. This is that slice. It also keeps the temporary
wholesale rebuild from quietly hardening into an assumption the rest of the code leans on.

## Approach

Put a small stateful reconciler between the scene graph and the built scene, in the same
bridge layer that owns `buildFramedScene` today. The reconciler caches what it builds,
keyed by floor, and hands back the cached build when nothing that floor draws from has
changed.

The dirty signal is already there to use. The scene-graph deriver memoizes each floor's
node by the source `Floor` object, and the editor's command handlers replace an edited
floor with a new object while leaving untouched floors alone. So a floor's node keeps its
reference until that floor is actually edited. The reconciler reads the active floor's
node from the graph and compares its reference, together with the paint reference, against
what it built last time for that floor. A match means the floor is unchanged, and the
reconciler returns the cached framed scene as is, with no rebuild and no camera reframe.
A miss means the floor was edited, so it calls `buildFramedScene` for that floor, stores
the result under the floor's id, and returns it.

Floors are non-local within themselves: junctions miter against their neighbors, so moving
one wall can change the geometry of every wall sharing a junction with it. Rebuilding the
whole floor on any change to it resolves all of those junctions together, which is why the
floor is the unit of rebuild rather than the single wall. The reconciler keeps the builds
of floors it has seen, so switching among the floors of a multi-story house reuses each
floor's scene until that floor is edited.

The consumer changes by one line of intent: instead of calling `buildFramedScene` inside a
memo, it holds one reconciler instance for the life of the view and asks it to reconcile
the current graph and paint. When the reconciler reuses a floor, it returns the same scene
objects it returned before, so the camera, the proxy overlay, and the per-frame fade all
see stable inputs and do no work.

The reconciler is a pure wrapper around the existing build. The change does not alter what
any scene looks like, so it is behavior-preserving: the existing end-to-end suite and the
committed scene baselines stay green without regeneration.

## Scope

In scope:

- A stateful reconciler, created once per view, that reconciles a scene graph and a paint
  set into a framed scene, reusing the cached build of a floor whose node reference and
  paint reference are both unchanged and rebuilding it otherwise.
- Caching keyed by floor id so switching back to an unedited floor reuses its build.
- The consumer change in the live preview from a per-edit `buildFramedScene` memo to one
  persistent reconciler instance.
- Unit tests on the reconciler's reuse and rebuild decisions.

## Deferred, by design

- **Reuse within a changed floor.** When a floor is edited, its whole scene is rebuilt,
  including the walls, rooms, and openings that the edit did not touch. Reusing those
  unchanged meshes needs finer memoization in the deriver (openings and rooms keyed by
  their own content, not their floor) and a mesh-level reconciler that diffs and patches
  rather than rebuilds. That is the heavier reconciler the option-B middle ground sets
  aside; it lands later behind this same seam.
- **Per-floor paint differencing.** Paint is one project-wide set today, so any paint edit
  invalidates the cached builds and they rebuild on next use. Narrowing a paint change to
  the floors it touches is a later refinement.
- **Cache eviction.** The reconciler keeps a build per floor it has shown. A building has
  few floors, so the cache is small and bounded; a size cap is left for later if it ever
  matters.
- **Showing more than one floor at once.** The preview shows the active floor only. The
  reconciler's interface returns one framed scene, the same shape the build returns now,
  so a future multi-floor view can extend it without changing the consumer.

## Verification

- Unit tests on the reconciler: reconciling the same floor node twice returns the same
  framed scene without rebuilding; an edit that replaces the floor node returns a new build;
  a paint change returns a new build; switching to a floor seen before and unchanged returns
  its cached build; an empty graph with no active floor builds without caching.
- The live preview wires the reconciler in place of the per-edit build. The change is
  behavior-preserving, so the existing live-scene end-to-end suite renders the same canvas
  and the committed scene baselines are unchanged, which is the evidence that no visible
  behavior moved.
