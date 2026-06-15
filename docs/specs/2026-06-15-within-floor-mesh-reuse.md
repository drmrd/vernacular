# Within-floor mesh reuse in the three-dimensional preview

Date: 2026-06-15

## Problem

The preview reconciler now reuses a floor's whole build until that floor is
edited, and rebuilds the whole floor when it is. That floor-level reuse handles
switching among floors and edits that miss the shown floor, but it leaves the
common case untouched: a single edit to the active floor tears down and rebuilds
every wall, room, and opening on it, including the ones the edit never touched.
Resizing one door rebuilds every room slab and every other door. Nudging one wall
rebuilds every room, even the rooms on the far side of the floor that did not move.

The foundation named this as the heavier tier behind the same seam, and the
incremental-updates slice deferred it by design: reuse within a changed floor needs
finer change tracking than the floor reference carries, and a reconciler that
diffs a floor down to its entities and rebuilds only the dirty ones. This is that
slice.

## What blocks per-entity reuse today

Two facts in the deriver decide what a floor edit invalidates.

Walls are already memoized by their source `Wall` object, so an unchanged wall
keeps its scene-node reference across an edit. That reuse signal is ready to use.

Openings are not memoized at all. The deriver flat-maps every floor's openings on
every derivation, so an opening node is a fresh object on every edit even when its
opening did not change. There is no reference to reuse it by.

Rooms are memoized by the source `Floor` object, and a room is a derived
projection of the wall topology with no source object of its own. Any edit to a
floor replaces the `Floor` object and re-derives all of its rooms, so a room node
is a fresh object after any floor edit, including edits that change no room at all
(resizing a door does not move a wall, so it cannot reshape a room).

## Approach

Two deriver refinements supply the per-entity reuse signals, and a sub-floor
reconciler spends them.

### Deriver refinements

Memoize openings by their source `Opening` object, in a `WeakMap<Opening,
OpeningSceneNode>`, the same reference memoization walls already use. An unchanged
opening then keeps its node reference across an edit. This is the entity-keyed
dirty tracking the scene-graph decision (ADR-0018) already applies to walls,
extended to the entity that was missing it.

Re-key the room memoization on the floor's `walls` array instead of the whole
`Floor` object. Rooms derive from the wall topology and the room overrides and
from nothing else, so the walls array is the right dirty key: an edit that leaves
the walls untouched, such as resizing a door, keeps the array reference and so
keeps every room node, while a wall edit replaces the array and re-derives the
rooms as before. This stays pure reference memoization; it only narrows the key
from the floor to the part of the floor the rooms actually read.

### Sub-floor reconciler

Build a floor's group as a composition of self-contained sub-groups, one for the
walls, one per room, one per opening, each carrying its own edge overlay and shadow
flags so that a reused sub-group needs no further decoration. The reconciler caches,
per floor, the assembled group together with the entity nodes each sub-group was
built from. On a rebuild of that floor it assembles a fresh floor group, reusing
each sub-group whose entity is unchanged and building only the dirty ones:

- **The wall group** is the floor's non-local unit. Junctions miter against their
  neighbors and openings cut voids into their host walls, so the wall group is
  reused only when every wall node and every wall-hosted opening node is unchanged,
  and is otherwise rebuilt whole. Rebuilding it whole re-resolves all of its
  junctions and voids together, which is why the wall is never the unit of rebuild.
- **Each opening fill** is reused when its opening node reference is unchanged, now
  that openings are memoized.
- **Each room shell** is reused when its derived room node is content-equal to the
  node the cached shell was built from. Rooms have no source object to compare by
  reference, so they are compared by value over the geometry the shell reads: the
  polygon, clear polygon, outer polygon, holes, area, and ceiling height. A wall
  edit re-derives every room node but changes only the rooms next to the moved wall,
  so the unchanged rooms compare equal and are reused. This is the dominant-case win.

The floor group's elevation is set from the floor node on every assembly, so an
elevation change is honored even when the sub-groups are reused.

The camera pose and world bounds are unioned from the assembled group on every
rebuild, the same values a whole-floor build would produce, so reuse never changes
the framing. The near-wall transparency targets are rebuilt with the wall group,
since they clone wall materials, and reused with it.

### Comparing derived rooms by value

Comparing rooms by value is a deliberate departure from the reference-only
memoization the scene-graph decision settled on, and it is confined to the bridge
reconciler, not the core deriver. The deriver stays reference-only, because a
stored entity has an object whose identity is the dirty signal. A derived room has
no such object: the only way to tell an unchanged room from a changed one is to
compare what was derived. Putting that comparison in the reconciler keeps it out of
the deriver, where reference identity remains the single rule, and scopes it to the
one kind of node that cannot use it.

## Reuse semantics

| Edit                                           | Wall group                                                                         | Rooms                                       | Openings                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------- |
| Resize or move one opening                     | rebuilt (its void changed)                                                         | all reused                                  | the edited one rebuilt, the rest reused            |
| Move or reshape one wall                       | rebuilt                                                                            | the adjacent rooms rebuilt, the rest reused | the openings on that wall rebuilt, the rest reused |
| Edit off the shown floor, or switch back to it | all reused (floor reference unchanged, the floor-level reuse from the prior slice) |                                             |                                                    |
| Any paint edit                                 | the whole floor rebuilt (the prior slice's behavior, retained)                     |                                             |                                                    |

## Scope

In scope:

- Memoizing opening nodes by their source object in the deriver.
- Re-keying room memoization on the floor's walls array.
- Building a floor group from self-contained per-entity sub-groups, each carrying
  its own edge overlay and shadow flags.
- A sub-floor reconciler that reuses unchanged sub-groups and rebuilds only the
  dirty ones, recomputing bounds and pose to match a whole-floor build.
- Unit tests on the deriver's reuse signals, on room value-equality, and on the
  reconciler's per-entity reuse and rebuild decisions by object identity.

## Deferred, by design

- **Per-floor paint differencing.** A paint edit still rebuilds the floor whole, as
  before. Narrowing a paint change to the entities it repaints is a later
  refinement once paint is keyed more finely than one project-wide set.
- **Sharing geometry between rebuilt entities.** A rebuilt entity builds fresh
  geometry; reusing buffer geometry across entities with identical shapes is a
  further optimization not pursued here.
- **Cache eviction and multi-floor display.** Carried forward from the prior slice:
  the cache keeps one build per floor shown, and the preview shows one floor.

## Verification

- Deriver unit tests: an unchanged opening keeps its node reference across an edit;
  an opening edit replaces only that opening's node; a non-wall edit keeps every
  room node; a wall edit re-derives the rooms.
- Reconciler unit tests by object identity: an opening edit reuses every room shell
  and every other opening fill; a wall edit reuses the rooms that did not change and
  the openings off the moved wall; the assembled pose and bounds match a whole-floor
  build of the same graph.
- The change is behavior-preserving. The existing live-scene end-to-end suite renders
  the same canvas and the committed scene baselines are unchanged, which is the
  evidence that no visible geometry moved.
