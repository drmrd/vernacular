# Daylight through glass (slice specification)

> Status: draft for review. Date: 2026-07-05. Author: Dan Moore.
> Relationship to the epic: slice 2 of the realistic-environmental-lighting spine
> (`docs/specs/2026-07-01-realistic-environmental-lighting.md`), after the visible sky and the
> spherical-harmonics probe (ADR-0148) and the ambient-occlusion pass (ADR-0151). Closes issue #444.

## Mission

Sunlight should reach the floor through a window. Today every mesh in a built scene casts a shadow,
so a window's glass pane throws an opaque rectangle on the floor as if it were a wall. A room in
direct sun reads as sealed rather than lit. This slice makes the glass pane stop casting while the
sash and muntin frames keep casting, so the sun streams through the pane and the frame pattern falls
across the floor.

The code change is small and its effect is large. The slice also shapes the glass role so the
stained-glass light cookie the epic reserves for later (layer 4) has a named place to attach.

## Scope

In scope:

- A build-time role stamp on each opening-fill mesh, so a later reader can tell a glass pane from a
  frame without inspecting its material.
- A role-aware `markShadowCasters` (`engine/scene/shadow-casters.ts`): a glass pane stops casting,
  every other mesh keeps casting, and glass keeps receiving.
- An exported `isGlassPane` predicate that both names the shadow rule and marks where the future
  stained-glass cookie attaches.
- One canonical harness state, `window-light`, that frames a sunlit window from inside the room so
  the muntin and frame shadow on the floor reads plainly at capture size.
- An optional camera pose on a named harness environment state, so the window-light state supplies
  its interior vantage without touching the geometry fixtures.
- A regeneration of every scene baseline that shifts, in both baseline families.

Out of scope:

- The stained-glass light cookie itself (epic layer 4). This slice fixes the attachment point and
  adds no cookie code.
- The transmissive colored-glass material (slice 3, issue #449). That slice replaces the glass
  material, which is the reason the shadow rule here does not key on the material.
- Artificial light. The epic holds it to a later wave.
- The door leaf, which is opaque and keeps casting.
- A south-facing shell window, which would let the shared solar instants also show daylight through
  glass. Deferred and tracked in a follow-up issue; the window-light state is this slice's sole
  in-tree demonstration.

## The mechanism: a build-time role stamp

The opening-fill sections already carry a role. `openingFill` (`core/scene/opening-fill.ts`)
returns parts tagged `OpeningFillRole`, either `leaf` for a door leaf or a sash frame member, or
`glass` for a pane. The engine builder `buildOpeningFill` (`engine/scene/opening-fill-builder.ts`)
turns each part into a thin box mesh, then drops the role once it picks a material.

This slice keeps the role. When the builder makes a part mesh it stamps the part's `OpeningFillRole`
onto the mesh under one shared `userData` key. The stamp travels with the mesh into the scene tree.

`markShadowCasters` becomes role-aware through one exported predicate, `isGlassPane(object)`, which
returns true for a mesh stamped `glass` and false for anything else. The flagger keeps its
whole-tree walk. For each mesh it sets `receiveShadow` to true as before and sets `castShadow` to
the negation of `isGlassPane`. Glass stops casting; a frame, a wall, a slab, and a furniture box
all keep casting. Nothing else about the rig changes, so the sun the frames cast against stays
whichever sun the active mode already places.

### Why not material-name matching

The glass material carries `name: 'glass'` today (`engine/materials/role-appearance.ts`), so a
predicate could read `material.name`. Slice 3 (issue #449) swaps the glass material for a
transmissive `MeshPhysicalMaterial`, and a name-based rule would break the moment that material
changes, or the moment a paint provider renames it. The role stamp lives on the mesh, not on the
material, so a later material swap leaves the shadow rule intact. The stamp is the durable key and
the material name is not.

### Why not shadow-camera layers

Three.js can exclude an object from a light's shadow pass by putting it on a layer the shadow camera
does not render. Layers are a scarce global resource: there are thirty-two of them, and selection,
fading, and picking already claim some. Spending one on glass shadows couples this local rule to a
global budget. The per-mesh stamp costs nothing global and reads locally.

## Receiving shadows

Glass keeps `receiveShadow` set to true. A frame's shadow, or a mullion's, falling across the pane
is physically right, and a transom bar should shade the glass below it. There is no reason to
special-case the receive side, so the flagger sets `receiveShadow` uniformly and varies only the
cast side.

## The stained-glass cookie seam

The epic's layer 4 projects a sun-aligned light cookie so a stained pattern falls in color on
interior surfaces. That projection has to find the glass panes at render time. `isGlassPane` is that
finder. The predicate this slice exports to gate shadow casting is the same predicate the cookie
layer will use to collect the panes a cookie aligns to. ADR-0153 records this contract so the later
slice attaches to a named seam rather than reinventing a glass test. This slice adds no cookie
behavior; it only fixes the shape of the seam.

## The window-light harness state

The harness pins the result with a canonical state that a static frame can witness at capture size.
It follows the ambient-occlusion state (ADR-0151): a named entry in `app/harness-environment.ts`
under the shared `?scene=` keyspace, a fixed site and instant, realistic lighting on, and a capture
case in `e2e/tests/scene-solar.spec.ts`.

Site. The state shares the one canonical harness site with every other named state: 40 north, 75
west, plan-up as true north, Eastern time.

Instant. The state does not reuse the equinox-noon instant the other solar states share, and the
reason is in the geometry. The shell fixture's only window sits in the east wall, and the
equinox-noon sun stands almost due south (azimuth about 177 degrees;
`core/environment/solar-position.test.ts`). A due-south sun grazes an east wall and never enters an
east window, so it casts no window shadow on the floor. The committed `equinox-noon` baseline
confirms this: its interior floor carries no window pattern. The window-light state uses instead the
summer-solstice morning instant that the same reference case pins,

```
{ date: '2026-06-21', minutesSinceMidnight: 540 }
```

which is 09:00 Eastern, whose sun stands due east (azimuth about 89 degrees) at a moderate altitude
(about 37 degrees). That sun sits beyond the east window, so it streams straight through the pane
and throws the frame and muntin shadow west across the interior floor. The site timezone resolves
the same offset on that date the reference case uses, so the harness sun matches the reference sun.

Geometry. The state pairs the wall-shell fixture, whose east wall carries the double-hung window
over a clear floor. It adds no furniture, so nothing stands between the window and the floor to
break up the pattern.

Camera. The state frames the window from inside the room. The standing auto-frame the other states
use fits the whole shell from outside the southeast corner, and a floor pattern does not read at
that size. The window-light camera stands inside the room at roughly standing eye height, west of
the window, aimed at the window center and tilted a little down, so the window with the bright sun
beyond it and the stretch of floor just inside the sill are both in frame. The exact eye and target
are tuned against the 320 by 240 capture until the muntin shadow is the clear subject of the frame.

The pose attaches to the environment state. `HarnessEnvironmentState` gains an optional camera
pose, `app.tsx` forwards it with the rest of the environment, and `SceneHarnessView` resolves its
camera with a fixed precedence: an environment pose wins, then a geometry override (the
adjacent-rooms case, ADR-0150), then the auto-frame. The pose cannot key on the geometry the way
the adjacent-rooms pose does, because window-light reuses the plain shell geometry and the
schematic `scene-shell` baseline keeps the standing frame for that same geometry.

Capture. A new case in `scene-solar.spec.ts` screenshots `scene-window-light-webgl.png` at the
shared shell threshold and diff ratio.

### Why not a second geometry fixture

The alternative was the adjacent-rooms pattern taken literally: a second geometry key that
duplicates the shell fixture and pairs its own pose. That copies a body that renders identically to
the shell just to express a camera, it grows the shared `?scene=` keyspace with the copy, and the
next state that needs a pose faces the same choice again. One optional field on the environment
state carries the pose and leaves the geometry keys alone.

## Which baselines move

The shadow rule runs in every lighting mode. `markShadowCasters` is called once when the scene is
built (`bridge/react/framed-scene.ts`), before any provider is chosen, so glass stops casting under
the schematic rig and the solar rig alike. A baseline moves when its camera sees the interior floor
where a sunlit window's glass casts today. Reading the committed baselines sorts them into three
groups.

The schematic scene baselines move. The `scene-visual-regression` baselines render the harness with
no environment, so the fixed schematic sun applies. That sun aims east and up (`SUN_DIRECTION`,
`engine/lighting/lighting-rig.ts`), which is the one direction that enters the shell's east window.
The `scene-shell`, `scene-shell-warm`, `scene-shell-painted`, and `scene-furniture` baselines all
render that east window sunlit, so they carry the glass pane's interior shadow today and shift to
the frame pattern once glass stops casting. `scene-junctions` has no openings and
`scene-adjacent-rooms` has no glazing, so neither moves.

The realistic solar baselines mostly hold. The `equinox-noon`, `color-check`, and `overcast-noon`
states share the due-south equinox-noon sun, `winter-afternoon` sits low in the southwest, and the
`ambient-occlusion` state uses the equinox-noon sun as well. None of those directions enters an east
window, and the committed baselines show no window shadow on their floors. Removing the glass cast
changes them by at most a thin sliver where a grazing sun clips the pane, and likely not at all.
They are still re-run so any residual shift is captured and reviewed.

This is the inverse of the ambient-occlusion slice, where the solar baselines moved and the
schematic ones held (ADR-0151). Here the schematic shell family moves and the solar states hold. The
new window-light state is the one baseline built to show the result plainly, because no existing
state lights the shell's east window from beyond it. It is this slice's sole in-tree demonstration
of daylight through glass: a south-facing shell window, which would let the shared solar instants
show it too, is deferred and tracked in a follow-up issue.

## Acceptance

- A frame or sash member built from an opening-fill `leaf` part casts a shadow; a `glass` pane does
  not. The engine unit tests on the role stamp, the predicate, and the flagger verify this.
- Glass keeps receiving shadows.
- `isGlassPane` is exported and returns true for exactly a mesh stamped `glass`.
- The `window-light` baseline shows the muntin and frame shadow on the interior floor, with light
  where the panes are.
- An environment camera pose wins over the geometry override and the auto-frame; a state without
  one frames exactly as before, so the schematic `scene-shell` framing does not change.
- The schematic `scene-shell`, `scene-shell-warm`, `scene-shell-painted`, and `scene-furniture`
  baselines carry the glass pane's interior shadow today, so they shift to the frame pattern; they
  are regenerated and reviewed. `scene-junctions` and `scene-adjacent-rooms` do not move. The solar
  states are re-run and reviewed for any residual change.
- Every baseline that shifts is regenerated in both the `-darwin` and the `-linux` family.
- The owner's review of the regenerated baselines is the visual acceptance. CI checks only the
  `-linux` family and the `-darwin` family renders locally (ADR-0149, ADR-0152).

## References

- Issue #444 and the realistic-environmental-lighting epic
  (`docs/specs/2026-07-01-realistic-environmental-lighting.md`, slice 2 and the stained-glass
  layering note).
- `core/scene/opening-fill.ts`, `engine/scene/opening-fill-builder.ts`,
  `engine/scene/shadow-casters.ts`, `engine/materials/role-appearance.ts`,
  `engine/lighting/lighting-rig.ts`.
- `app/harness-environment.ts`, `bridge/react/scene-harness-view.tsx`,
  `e2e/tests/scene-solar.spec.ts`, `core/environment/solar-position.test.ts`.
- ADR-0148 (visible sky and probe), ADR-0149 (harness lighting readiness and the darwin baselines),
  ADR-0151 (ambient-occlusion pipeline and the solar-baseline regeneration precedent), ADR-0152 (the
  linux scene-baseline lane). ADR-0153 records the role-stamp mechanism and the cookie seam.
