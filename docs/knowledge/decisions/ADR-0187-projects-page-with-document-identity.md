---
slug: decisions/ADR-0187-projects-page-with-document-identity
title: 'ADR-0187: The Projects page lands with document identity'
type: decision
tags: [app-shell, projects, project-identity, session, ui]
related:
  [
    decisions/ADR-0188-project-id-address-and-index-record,
    decisions/ADR-0189-one-writer-and-second-tab-sees-projects-page,
    decisions/ADR-0190-strict-check-refuses-and-two-classes-of-repair,
    decisions/ADR-0191-export-on-every-card-and-unchecked-copy,
    decisions/ADR-0175-session-layer-for-application-state,
    decisions/ADR-0183-own-id-for-a-project-started-after-a-failed-load,
    decisions/ADR-0154-arris-visual-design-language,
    decisions/ADR-0104-unsaved-changes-guard-and-dirty-state-model,
  ]
sourceFiles:
  [
    editor/shell/project-menu.tsx,
    app/use-project-actions.ts,
    app/use-open-file-action.ts,
    session/editor-session/discard-guard.ts,
    session/flows/switch-project.ts,
    docs/specs/2026-11-14-architecture-refactor-round.md,
  ]
status: current
updated: 2026-11-21
---

# ADR-0187: The Projects page lands with document identity

## Status

Current. The owner took decisions 1 and 3 to 10 of section 4.1 of
`docs/specs/2026-11-15-session-layer-and-document-identity.md` on 2026-11-15 and approved the rest
the same day, with that specification. It supersedes the part of ADR-0104 that puts a discard
prompt in front of New project, Open file, Open folder, and the recent list. The code changes with
#685. Until then the application has one project slot, no page lists projects, and the discard
prompt still stands.

> Updated on 2026-11-18. The switch with no prompt is built ahead of the Projects page. New
> project, Open file, Open folder, a recent project, and a file dropped on the canvas write the
> open project's pending changes, open the other project, and then close the first, with no
> question (`session/flows/`). If the write fails, the switch stops and the application says "The
> changes could not be saved, so the project stays open." If the other project does not open, the
> current one stays open with its undo history. Each new project and each imported file gets its
> own id, and Open file already makes a copy in the workspace and leaves the file alone, though the
> menu entry still reads "Open file". No page lists projects yet, and the prompt for a recovered
> copy stays.

> Updated on 2026-11-21. The Projects page lists the stored projects, one card for each, and
> `#/projects` shows it. "Switch projects" in the Project menu shows the page over the open
> project. The menu entry that read "Open file" now reads "Import file".

## Context

The umbrella specification (`docs/specs/2026-11-14-architecture-refactor-round.md`, section 6)
listed the second stage with no paired feature. That stage gives a project an identity and puts
every store behind one codec. Once it lands, two projects can exist in storage, and with no page to
list them the user has no way to see the second one (#588).

The owner changed that during the brainstorm for the stage specification. The Projects page is
part of the stage: list, open, new, rename, and delete. Anything more gets its own issue.

## Decision

- The Projects page is part of the second stage.
- The page is a grid of cards. Each card has a preview of the first floor in the floor list, with
  no room labels and no dimensions, and four facts: the project name, the time of the last change,
  the number of floors, and where the project is stored ("In this browser." or
  "Folder: &lt;name&gt;"). A project in a workspace that lives in memory reads "In this tab only."
- A state is a line of plain text, never a badge. A state line is a statement. It is never an
  instruction and never a control, and it cannot take focus. A project that did not open shows
  "This project did not open." where its preview would be.
- A click on a card opens the project. A "..." control holds the card's actions.
- Switching goes through the Projects page. It is a full page, not a dialog, and the menu entry is
  "Switch projects".
- The open project stays open while the page shows. Returning to it keeps its undo history.
- A click on another card switches with no prompt. Pending changes are written, the other project
  opens, and then the current one closes. If the write fails, the switch stops and the application
  says so. If the other project does not open, the current one stays open with its undo history.
- Delete asks for confirmation in a dialog that names the project and says the action cannot be
  undone.
- A folder project has "Remove from list" in place of Delete. It removes no file from the folder
  and shows no dialog.
- The menu entry that reads "Open file" today becomes "Import file". An import makes a copy in the
  workspace and leaves the file alone.

How the page looks is left to the design language (ADR-0154). This record fixes what it shows and
what it does.

## Consequences

- The stage is larger than the umbrella specification assumed. It gains a page, three dialogs,
  addresses, and end-to-end journeys.
- The discard prompt in front of New project, Open file, Open folder, and the recent list goes
  away, because a switch writes pending changes instead of asking whether to throw them away. The
  prompt for a recovered copy stays.
- Sections 6 and 10 of the umbrella specification change. The second stage gets a paired feature,
  and the risk that the first two stages show the user nothing is corrected.
- More facts on a card, search and sorting, duplicate, a "Recently deleted" area, and the other
  later items of section 9 of the stage specification each get an issue when it is approved.

## References

- `docs/specs/2026-11-15-session-layer-and-document-identity.md`, sections 4.1, 5.1, 5.8, 5.9, 8,
  and 9.
- `docs/specs/2026-11-14-architecture-refactor-round.md`, sections 6 and 10.
- ADR-0104, whose discard prompt this supersedes, and ADR-0175, ADR-0183, and ADR-0154.
- Issues #685 and #588.
