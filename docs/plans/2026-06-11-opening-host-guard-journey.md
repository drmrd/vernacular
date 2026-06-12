# Opening Host Guard Journey (characterization)

> A characterization slice: the host guard already holds; this journey proves it
> from the assembled editor and makes it an enforced requirement. No product code.

**Goal:** Flip `opening-host-guard` to `required` with a journey that drives opening
placement through the real editor, proving an opening hosts only on a wall. The third
capability of the wall-drawing-completion slice.

**Background:** An opening has a `hostWallId`. Placement resolves that host with
`placeOpeningTarget`, which hit-tests walls alone (`hitTestWalls`) and returns null
when the click falls clear of every wall. The placement glue (`useOpeningPlacement`)
drops a null target without dispatching, so a click off the walls never creates an
opening. Wall-drawing snapping tells the same story from the other side: its context
holds `walls` only, so a drawn endpoint cannot attach to an opening. Both paths
already keep the host of any hosted element a wall and never an opening, but no journey
exercised that from the assembled app, so the capability stayed `pending`.

**The journey** (`e2e/tests/journeys/opening-host-guard.spec.ts`, title
"a wall cannot host on an opening"): draw a wall, switch to the opening tool, click on
the wall and watch one opening proxy appear (its host is the wall), then click clear of
every wall and confirm no second opening appears (a point off the walls hosts nothing).
Opening proxies read through their accessible label, which ends in "wide", so they are
distinct from wall, room, and dimension proxies. Verified passing in chromium.

**Done when:** the journey is committed, `opening-host-guard` is `required`, and the
full chain plus `pnpm integration:audit` (8 required / 3 pending) and `pnpm rgb:audit`
are clean. The journey commit is `test(e2e):`, a characterization of existing behavior
with no red-green-blue feature cycle.

**Still pending in the wall-drawing slice:** chained polyline with smart angle snap,
and along-wall snapping (`snap-along-wall`).
