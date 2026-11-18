---
slug: decisions/ADR-0211-stored-indexeddb-records-become-files
title: 'ADR-0211: Stored IndexedDB records become files one at a time, and a doubt keeps the record'
type: decision
tags: [storage, indexeddb, migrations, data-loss, multi-tab, persistence]
related:
  [
    decisions/ADR-0003-storage-provider-pattern,
    decisions/ADR-0028-directory-port-folder-storage-seam,
    decisions/ADR-0042-underlay-asset-persistence,
    decisions/ADR-0119-write-ahead-crash-recovery,
    decisions/ADR-0182-migration-backups-in-their-own-directory,
    decisions/ADR-0184-known-keys-from-the-schema-for-the-save-time-graft,
    decisions/ADR-0188-project-id-address-and-index-record,
    decisions/ADR-0190-strict-check-refuses-and-two-classes-of-repair,
  ]
sourceFiles:
  [
    storage/indexeddb/indexeddb-directory.ts,
    storage/indexeddb/indexeddb-requests.ts,
    storage/indexeddb/open-attempt.ts,
    storage/indexeddb/legacy-records.ts,
    storage/indexeddb/legacy-json.ts,
    storage/indexeddb/indexeddb-project-store.ts,
    storage/project-storage.ts,
    storage/indexeddb/legacy-records.browser.test.ts,
    storage/indexeddb/legacy-records-conversion.browser.test.ts,
    storage/indexeddb/legacy-records-safety.browser.test.ts,
    storage/indexeddb/legacy-records-interference.browser.test.ts,
    storage/indexeddb/indexeddb-directory.browser.test.ts,
    docs/specs/2026-11-15-session-layer-and-document-identity.md,
  ]
status: current
updated: 2026-11-17
---

# ADR-0211: Stored IndexedDB records become files one at a time, and a doubt keeps the record

## Status

Current, 2026-11-17. Section 5.3 of `docs/specs/2026-11-15-session-layer-and-document-identity.md`
left the byte-level interface to the builder and named a directory port over IndexedDB as one way
to meet it. This record holds the choice that followed: how the projects that existing users keep
in IndexedDB become files, and the safety rules of that conversion. The code is in
`storage/indexeddb/` (#672).

## Context

Until now the IndexedDB store kept database `vernacular` at version 1 with one object store,
`projects`, keyed by `id`. Each record was `{ id, project }`, where `project` was the live project
object, not bytes. Browsers without the origin private file system use this store by default, so
real users hold projects in it.

Section 5.3 of the specification puts every store behind one wrapper that decodes on read and
encodes on write. The wrapper keeps migration backups (ADR-0182), the snapshot store keeps
recovery snapshots (ADR-0119), and the asset cache keeps a pool shared by all projects (ADR-0042).
All three work on files through `DirectoryPort` (ADR-0028). A store that holds objects gets none of
them, and the IndexedDB store had no backups, no snapshots, and an asset cache that lived in
memory. The specification also says that records that exist today still open.

## Decision

- Database `vernacular` goes to version 2. The upgrade adds an object store `files`, keyed by
  `path`. Each file is one record `{ path, bytes, modifiedAt }`. The upgrade does not touch
  `projects`.
- `IndexedDbDirectory` is a `DirectoryPort` over that database. The IndexedDB store is the
  workspace wrapper over it, and the default asset cache uses the same directory, so this backend
  gets the codec, backups, snapshots, and a durable shared asset pool like the others.
- While a record has no file, the directory serves it as the file `<id>/vernacular.json`. The bytes
  are `JSON.stringify` of the stored object. The record is listed as a project, and its time of
  last change is the start of the Unix epoch, because a record carries no time.
- The conversion runs each time a connection opens, before the first operation resolves. For each
  record it writes `JSON.stringify` of the stored object as the file. That is a copy of the stored
  data, not an encode. The wrapper then reads the file like any other: it migrates in memory and
  keeps a pre-migration backup of exactly those bytes.
- After the write, the conversion reads the file back. It deletes the record only when the
  read-back equals the bytes it wrote, and only when, in one transaction, the file still holds
  those bytes and the record still turns into them.
- Records convert one at a time, each in its own transactions, and an error on one is caught. One
  bad record does not stop the others or the open. A record that stays is tried again at the next
  open. A record whose conversion fails leaves a console warning with its id and the error. A
  record that stays on purpose, because JSON cannot hold it unchanged, gives no warning.
- A record converts only when JSON keeps its object: parsing the text must give the object back,
  and only a property whose value is undefined may drop out. Any other record stays and is served.
  A record that has no `project`, or whose id cannot name a project directory, is not converted,
  listed, or served.
- A file that a save wrote is never deleted or replaced by the conversion. To tell its own file from
  a saved one, the conversion marks the file it writes with a one-off token, `convertedBy`. A save
  writes a file record without the token, so the first save removes the mark.
- When the read-back does not match, the conversion deletes the file in one transaction, and only
  while the file still carries its token and the record still exists. The record stays and is
  served.
- At a later open, a file with the record's bytes lets the record go, and the file keeps whatever
  mark it has. A marked file with other bytes is a conversion that went wrong and was not cleaned
  up, for example after a crash, so a new marked file replaces it. An unmarked file with other bytes
  was saved by someone, and the conversion leaves both the file and the record alone.
- Removing a project file, or a project's directory, deletes its record in the same transaction.
  A removed project does not come back from its record at the next open.
- The directory keeps at most one pending open request and never starts a second while one is
  pending. When another tab blocks the upgrade, for example a tab of an older build that holds the
  database at version 1, the call that started the open rejects at once with a message that asks
  the user to close that tab. Each later call on the same directory object waits on the same
  pending open for a short fixed time, 500 milliseconds (`BLOCKED_OPEN_WAIT_MILLISECONDS`), and
  then rejects with that message. When the other tab closes, the pending open succeeds and the next
  call works. A connection that arrives while no call waits is closed. An open of a database at a
  version above 2 rejects too.

## Consequences

- An older build cannot open the database after the upgrade. It asks for version 1 and the browser
  refuses, because the database is at version 2. Going back to an older build loses access to the
  projects in the browser until the user returns to this build.
- While a tab of an older build stays open, a tab of this build cannot upgrade the database. It
  shows the message about the other tab until the old tab closes. The older builds hold no project
  lock in production, so this build cannot see the old tab before it asks for the upgrade.
- From the moment this build asks for the upgrade, the old tab's own database requests wait behind
  it and then fail with a version error. The old tab can no longer save. The stored data stays as
  it was, but edits made in the old tab after that moment are not stored.
- One case stays open. A second directory object over the same database, made while the upgrade is
  blocked, starts its own open request, and that request waits until the other tab closes. The
  application makes one directory object.
- A record that cannot convert stays and is served at every open. Its served bytes are JSON text,
  so the codec reads a value that JSON changes in its changed form: a number that is not finite
  reads as `null`. The stored object keeps the original value, but no part of the application
  reads it. A record that JSON cannot write at all, such as an object that refers to itself, is
  listed, and reading it rejects with an error that names JSON.
- The JSON comparison treats two changed values as equal. `-0` equals `0`, and named properties on
  an array are not compared. A project holds neither, and stopping for them would keep a good
  record for no gain. A value that is not a plain object or array, such as a date or a map, counts
  as changed, so its record stays.
- A converted file reports the time of its conversion as its time of last change, not the time of
  the user's last save.
- When the conversion cannot even read the list of records, the open fails, and the next call
  opens and tries again.
- Some things are not cleaned up. The `projects` object store stays, even when it is empty. A save
  to a project that is still a record writes its file and leaves the record behind it; the file
  shadows the record until the project is removed, and every listing still reads it. The mark on a
  converted file stays until the next save.

## Alternatives considered

- Keep the file when the read-back does not match. A file with wrong bytes is served before the
  record, and the next open sees a file with other bytes and leaves both. The project is then stuck
  on wrong bytes for good.
- Delete the file whenever the read-back bytes differ from the ones written. Another tab can save
  over the file between the write and the read-back, and the delete would lose that save.
- Compare times of change to tell the conversion's own file from a saved one. A save from another
  tab in the same millisecond looks like the conversion's own file. After a crash between the
  mismatch and the delete, nothing is left to compare. And another tab's open may already have
  deleted the record because the file matched, so deleting the file then loses the project. The
  token rule has none of these faults, because only the conversion writes a token and a save
  removes it.

## References

- `docs/specs/2026-11-15-session-layer-and-document-identity.md`, section 5.3, points 1 and 4.
- ADR-0028 (the port), ADR-0182 (backups), ADR-0119 (snapshots), ADR-0042 (the asset pool).
- Issue #672.
