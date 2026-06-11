# Journey coverage

Each user-facing capability of the editor has a journey test that drives the real
assembled application and proves the capability is reachable. The machine-readable
source of truth is `journey-coverage.json`; this file is its readable view.

A capability is `required` once its slice has landed: the integration-acceptance
gate (`pnpm integration:audit`) fails if a `required` capability has no journey
test with the listed title. A `pending` capability is tracked but not yet
enforced; the slice that builds it flips it to `required` in the same change that
adds the journey test.

| Capability         | Journey test title                                   | Status   |
| ------------------ | ---------------------------------------------------- | -------- |
| draw-wall          | draws a wall and shows it on the plan                | required |
| cancel-wall        | cancels a half-drawn wall with the cancel key        | pending  |
| undo-redo          | undoes and redoes a wall                             | pending  |
| delete-selection   | deletes the selected entities                        | pending  |
| switch-floor       | switches floors and the canvas changes               | pending  |
| edit-color         | edits a surface color and it applies                 | pending  |
| toggle-three-d     | toggles between the two- and three-dimensional views | pending  |
| edit-endpoint      | re-edits a wall endpoint after placement             | pending  |
| snap-along-wall    | snaps a new wall onto an existing wall               | pending  |
| opening-host-guard | a wall cannot host on an opening                     | pending  |
| donut-room         | derives a room with an interior void                 | pending  |
