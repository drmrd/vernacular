# Open and import an existing project from the editor

Date: 2026-06-15

## Problem

There is no discoverable way to open an existing project from the editor. The
export menu writes a project bundle, a plan file, and images, but nothing reads a
saved project back in. The project menu offers "New project" and a folder open
that depends on a directory-picker capability only some browsers expose, so on
the others there is no open control at all.

A project archive and a bare project document have no entry point of any kind.
Loading a three-floor sample archive into the running app could only be done by
seeding storage directly from a test harness, calling the storage modules by
hand. The importers for both forms already exist in the storage layer. They have
no user-facing surface.

The owner raised this as issue #204, confirmed while trying to load the sample
archive.

## Approach

Add one import path that accepts the two file forms the editor cannot currently
open: a project archive (the bundle file) and a bare project document (named
`vernacular.json`, or any `.json`). A small router in the storage layer reads the
file name and its bytes and routes by extension. An archive is unpacked through
the bundle store and loaded. A document is parsed and migrated forward to the
current schema, the same migrate-on-load path the folder store and the recovery
snapshots already use. An unsupported extension, an unparseable document, and a
document too old or malformed to migrate each raise a clear error.

Surface this two ways. An "Open file" entry in the project menu opens a file
picker that accepts both forms. This works in every browser, because it is a
plain file input rather than the directory-picker capability the existing folder
open needs. And a drop target over the editor viewport accepts the same files
dragged in from the desktop, showing a drop overlay while a file is over it.

After a successful import the project becomes the active project, is written to
the durable default store so it survives a reload, and is recorded in the
recent-projects list. The load-validation gate runs against the imported
document, as it does on a normal app load.

Report a failure with a small inline alert that names the file and the reason. A
success loads silently. A detailed account of which migration steps ran is left
for later; this slice surfaces the pass-or-fail outcome the issue asks for.

Assets follow the file form. A project archive carries its asset bytes, so
underlays resolve after import. A bare document carries no assets, so its
underlays have no bytes to decode. The resolve-on-open path already skips an
underlay whose bitmap is not present, so a document opens cleanly with its
underlays degraded rather than failing the load.

## Scope

In scope:

- An import router in the storage layer that turns a file name and its bytes into
  a migrated project, routing the archive and document forms and raising a clear
  error on anything it cannot open.
- An "Open file" action wired into the project menu that picks a file, runs the
  router, makes the result the active project, persists it to the default store,
  records a recent entry, and runs the load-validation gate.
- A drop target over the editor viewport that routes a dropped file through the
  same action, with a visible drop overlay while a file is dragged over it.
- An inline alert that reports an import failure with the file name and the
  reason.
- Tests at each layer: the router's routing and error cases, the action's
  make-active, persist, and record behavior with storage faked, the menu entry,
  the drop target, and the failure alert.

## Deferred, by design

- **No detailed migration report.** The slice reports pass or fail. An account of
  the individual migration steps that ran is a later addition.
- **No per-backend reopen of an imported archive.** An imported project persists
  to and reopens from the default store. A dedicated archive-backed reopen is out
  of scope, consistent with the current recent-open behavior.
- **No partial or merging import.** One file replaces the active project. Opening
  part of a project, merging into the current one, or opening several files at
  once is out of scope.
- **No new notification system.** The inline alert is local to the import
  surface.

## Verification

- Unit tests on the router: archive bytes produce a project; document bytes
  produce a migrated project; an unknown extension and an unparseable document
  each raise.
- A test that the open-file action, given a chosen file, makes the project
  active, writes it to the default store, and records a recent entry, with
  storage faked.
- A DOM test that the project menu shows "Open file" and invokes the action.
- A test that a file dropped on the viewport routes through the same action, and
  that the drop overlay shows while a file is dragged over it.
- A test that an import failure renders the inline alert naming the file and the
  reason.
