---
slug: decisions/ADR-0213-an-archive-is-read-as-an-untrusted-file
title: 'ADR-0213: An archive is read as an untrusted file, and an import copies only the assets its document refers to'
type: decision
tags: [storage, import, archive, zip, zip64, assets, asset-cache, content-addressed, security]
related:
  [
    decisions/ADR-0007-content-addressed-assets,
    decisions/ADR-0042-underlay-asset-persistence,
    decisions/ADR-0047-published-floor-plan-data-format-standard,
    decisions/ADR-0003-storage-provider-pattern,
    decisions/ADR-0190-strict-check-refuses-and-two-classes-of-repair,
  ]
sourceFiles:
  [
    storage/zip/read-archive.ts,
    storage/zip/zip-directory.ts,
    storage/zip/zip64-records.ts,
    storage/zip/inflate-entry.ts,
    storage/zip/archive-limits.ts,
    storage/zip/archive-layout.ts,
    storage/zip/content-hash.ts,
    storage/zip/needed-assets.ts,
    storage/import/import-project-file.ts,
    storage/import/copy-imported-assets.ts,
    session/flows/import-file.ts,
    app/use-open-file-action.ts,
    app/open-failure-text.ts,
    app/asset-report-text.ts,
    app/grouped-number.ts,
    docs/specs/2026-06-10-vernacular-floor-plan-format.md,
    docs/specs/2026-11-15-session-layer-and-document-identity.md,
  ]
status: current
updated: 2026-11-19
---

# ADR-0213: An archive is read as an untrusted file, and an import copies only the assets its document refers to

## Status

Current, 2026-11-19. Section 5.6 of `docs/specs/2026-11-15-session-layer-and-document-identity.md`
says that an imported archive brings its assets, that it is an untrusted file, and that the reader
refuses one above four limits. It leaves the way the reader works to the builder. This record holds
those choices. The code is the part of
`docs/plans/2026-11-15-session-layer-and-document-identity.md` on assets that travel with documents
(#673, #672). Section 2.3 of `docs/specs/2026-06-10-vernacular-floor-plan-format.md` cites this
record for what a reader takes and refuses.

The plan said that the reader would stream an archive with fflate's `Unzip`. This record replaces
that with a reader of its own over the central directory, for the reasons under "Decision".

## Context

Before this change an import of a `.building` archive inflated the whole file in memory with
fflate's `unzipSync`, with no limit of any kind, kept the document, and dropped the rest. A
furniture model or an underlay image of the archive then showed as missing. An export skipped an
asset that the browser lacked and said nothing.

An archive can come from anyone. A small file can declare a small size and inflate to a very large
one. It can declare more entries than it holds, point two entries at the same data, or name an entry
`../something`. It can carry bytes under a content hash that is not theirs. Since assets are
addressed by the hash of their bytes (ADR-0007), such an asset would show in every project of the
workspace that uses that hash.

## Decision

### Four limits, checked in a fixed order

The limits live in `storage/zip/archive-limits.ts`. Equal to a limit is allowed.

| Limit                                       | Value                       |
| ------------------------------------------- | --------------------------- |
| Length of the archive file                  | 536,870,912 bytes (512 MiB) |
| Sum of the declared inflated sizes          | 1,073,741,824 bytes (1 GiB) |
| Entries in the central directory            | 10,000                      |
| Declared inflated size of `vernacular.json` | 67,108,864 bytes (64 MiB)   |

`readArchive` in `storage/zip/read-archive.ts` checks in this order, and inflates nothing until
every check before inflation has passed:

1. The length of the file.
2. The end record. The reader searches back from the end of the file over at most the largest
   comment. It reads the ZIP64 records where the end record asks for them (see below). An archive
   that spans more than one disk, or whose ZIP64 records are malformed, is not an archive.
3. The entry count that the end record declares.
4. The central directory. It must end before the end record, or before the ZIP64 end record when
   one was read, and it must hold exactly the declared count of whole entries.
5. The declared size of the document, then the sum of the declared sizes of all entries.
6. Whether the archive holds a document at all.
7. The document is inflated, then each asset, then each asset is hashed.

A file above a limit gives `too-large` with the limit and its value. The application shows
"Open failed: " and one of four sentences, with every number grouped by `groupedNumber`
(`app/grouped-number.ts`):

- "The file is larger than 512 MB."
- "The file unpacks to more than 1,024 MB."
- "The file holds more than 10,000 entries."
- "The project document in the file is larger than 64 MB."

The open action checks the size of the picked or dropped file before it reads a byte, so the
browser never loads a file above 512 MiB into memory. That check runs for every file name, a
`.json` file included.

While it inflates, the reader holds each entry to its declared size. It feeds the stream to fflate's
`Inflate` in slices of 65,536 bytes and stops after the first slice whose output passes the declared
size, one slice after the output reaches it, or one slice after two slices in a row that gave no
output. An entry that passes its declared size makes the whole archive `not-an-archive`, since an
archive that lies about a size is hostile or broken. A DEFLATE stream that declares more than 1,032
times its own length cannot be true, and the entry is not inflated. The data of all entries that are
read may sum to no more than the length of the archive, so many directory entries that point at one
piece of data cannot make the reader inflate it again and again.

### The layout a reader takes

The reader takes two kinds of entry and ignores the rest without inflating them:

- `vernacular.json` at the root, the document.
- `assets/` followed by exactly 64 lower-case hexadecimal digits, an asset under its content hash.

Names are compared as they decode, with no change of case, no trim, no normalization, and no
joining of path segments. A leading byte order mark stays part of the name, so such a name matches
nothing. Only the first entry of a name counts. An archive with no `vernacular.json` gives
`no-document`, which the import shows with the same sentence as a file that is no archive.

### The hash check

An asset is accepted only when the SHA-256 of its bytes equals the hash in its name. Every other
asset entry of the layout is rejected under the hash of its name: a mismatch, an encrypted entry,
data outside the file, a stream that is corrupt or shorter than declared, an unknown method, and an
asset whose bytes cannot be hashed. The read goes on, and the document still opens. Assets are
hashed one at a time, in the order of the central directory, after all of them are inflated, so an
archive that a later asset refuses costs no hashing at all. The import does not hash again.

A page that is not a secure context has no `crypto.subtle`. There every asset is rejected, and the
project opens with each of them reported as missing.

### ZIP64 records are read, field by field

A ZIP64 value stands in for a classic field only when that field holds its marker (`0xFFFF` for a
field of 2 bytes, `0xFFFFFFFF` for one of 4). A classic field that holds any other value is used as
it is, also when a ZIP64 record is present and gives another value. The marker is the one signal
that the ZIP application note defines for a ZIP64 value, and real writers mix markers and classic
values in one record, so the rule holds for each field on its own.

- The end record: when any of its six fields holds its marker and a locator stands 20 bytes before
  it, the reader reads the ZIP64 end record that the locator points to. The locator must name disk
  0 and at most one disk, and the record must lie whole before the locator and carry its signature.
  Otherwise the file is not an archive. With no locator, the classic values stand.
- An entry of the central directory: three of its fields can hold a marker, in this order the
  declared size, the compressed size, and the offset of the local header. Each one that does takes
  the next 8-byte value of the first ZIP64 block (`0x0001`) of the entry's extra field. A block too
  short for its markers makes the file not an archive. With no block, the classic value stands. The disk number
  of an entry is not read.
- An 8-byte value is exact below 2^53. Above, it is never read as smaller than it is, so a limit
  still holds.

An archive that spans more than one disk is refused: the end record, settled, must name disk 0 for
itself and for the directory, and its two entry counts must agree. The limits apply to the settled
values.

### Why a reader of its own

The reader takes its list of entries from the central directory, which it parses itself, and
inflates each wanted entry with fflate's streaming `Inflate`. It does not use fflate's `Unzip` or
`unzipSync`.

- `Unzip` scans local headers in the order of the bytes and never reads the central directory or
  the end record. It cannot refuse an archive from the sizes and the count that the directory
  declares before anything is inflated. For an entry with a data descriptor it finds the end of the
  data by searching for a header signature. On a valid archive from a streaming writer, whose one
  stored entry held a nested ZIP, it gave 988 of the 2,113 bytes and reported an entry that the
  directory does not list.
- `unzipSync` follows the central directory, but with an output buffer it runs through the whole
  stream and drops what does not fit. Memory is bounded and time is not. It reads ZIP64 records in
  part, with no bound and no disk check.

The aim of the plan holds with `Inflate`: inflation stops when an entry passes its size, not after
the whole stream.

### An import copies only the assets that the document refers to

`importFile` in `session/flows/import-file.ts` reads the file, switches to a new workspace project,
and then copies into the shared pool each asset that the document needs and the pool lacks. The
needed assets are the content hashes that the document refers to, each once, without a `pack:`
reference that an installed pack supplies (`neededAssetHashes` in `storage/zip/needed-assets.ts`).
An accepted asset of the archive that the document does not refer to is never written.
`copyImportedAssets` never replaces an entry of the pool, sends only a value that is a content hash
to it, and gives the pool a copy of the bytes, not a view into the file. The needed hashes that the
pool still lacks come back as `missingAssets`, and the application shows one warning with their
count: "The file did not include 2 of the assets this project uses. They show as missing."

This narrows point 1 of section 5.6 of the session specification, which says that an import copies
the assets in the archive. The narrower rule has these reasons:

- The pool then holds nothing that no document lists. An asset that no document lists could never
  be removed by the delete rule of point 7 of that section.
- An archive cannot fill the pool with files that nothing uses.
- An export writes only referenced assets, so an archive made here never carries extra ones.
- An asset that the user keeps for later use belongs in the library, and a later delete keeps an
  asset that the library holds (`removableAssets` in `storage/assets/removable-assets.ts`).

## Consequences

- An imported archive brings its furniture models and underlay images. An asset with wrong bytes
  never enters the pool.
- No asset is written before the file is read and the switch has succeeded, and a refused file or
  a failed switch leaves every store as it was. A pool that cannot be reached, or a failed write of
  one asset, does not fail the import; those assets show as missing.
- `importProjectFile` returns a typed result in place of throwing (ADR-0003 carries a note).
- The reader inflates and hashes on the main thread. The limits bound the work, and the size check
  before the read keeps a file above 512 MiB out of memory, but a large archive can still block the
  page for seconds. The worst case found is a stream of empty blocks with one stored byte of output
  in each slice. It is never stopped and reads as sound: 6.0 s for 64 MiB on a loaded machine, so
  roughly 27 to 48 s for an archive of 512 MiB. Moving the reader to a worker changes no caller,
  since `readArchive` already returns a promise.
- Memory at the limits: the file and all its inflated assets are held at once, up to about 1.5 GB,
  plus one copy of the largest asset while it is written. One hostile slice can hold about 200 MB
  for a moment (the output, the growing buffer of fflate, and the copy it hands on). Decoding the
  names of a large directory of invalid bytes can make about 2 bytes of string for each byte. The
  limits are a first estimate and can change with evidence.
- The application can export an archive that it cannot import: more than 10,000 entries, more than
  1 GiB unpacked, or a file above 512 MiB. Before this change such a file opened with its document
  only. Now it is refused with the limit sentence.
- `ZipBundleProjectStore.fromBundle` and `unzipFolder` keep the old reader without limits. No
  production code calls them any more.

### Known limits

- Two entries of one name: this reader takes the first, and another common reader takes the last.
- Bytes before the first local header: the archive is refused. Some readers adjust for such a
  prefix.
- A gap between the central directory and the end record is allowed. One common reader places the
  directory right before the end record and so reads another directory than this reader does.
- A file whose ZIP64 records and classic fields disagree is read by its classic fields.
- A run of empty DEFLATE blocks that covers about three whole slices makes an entry corrupt. No
  writer makes one in normal use. A streaming writer does when it flushes about 33,000 to 44,000
  times in a row with no data between.
- A count of 2^53 or more is compared as a rounded number.
- An accepted stored asset is a view into the caller's buffer. The caller must not change or
  transfer that buffer until the promise settles, and must copy what it keeps.
- A page that replaces `crypto` can make the reader accept any bytes. That is outside the trust
  boundary.
- The import cannot say why an asset was rejected: wrong bytes, an entry that could not be read, and
  a hash that could not be computed all land in one list. The warning therefore says only that the
  asset is missing.
- When the tab closes after the pool writes and before the save of the new project, the copied
  assets stay in the pool with no document that lists them. Nothing removes them yet, and a second
  import of the file uses them again.
- A library that cannot be listed counts every `pack:` reference as supplied, so no pack asset is
  reported as missing. A starter manifest that is not valid lists no pack, so every pack reference
  is reported as missing.

## Alternatives considered

- fflate's `Unzip`, as the plan said. It cannot refuse from the central directory, and it misread a
  valid archive.
- `unzipSync` with an output buffer for each entry. Its time has no bound, and it reads ZIP64 values
  without checks.
- Refuse every archive in the ZIP64 form. Simpler, but a valid archive from another tool inside the
  limits would not open. The owner chose that every such archive opens.
- Take a ZIP64 value whenever a ZIP64 record is present. The application note ties a ZIP64 value to
  the marker, and writers mix the two forms, so a record could then override a sound classic value.
- Copy every accepted asset of the archive into the pool, as the session specification first said.
  An archive could then fill the pool with files that no document lists and that a delete never
  removes.
- Trust the name of an asset entry. One file could then stand in for another in every project that
  uses its hash.
- Hash each asset right after it is inflated. It would hold fewer bytes at once only when every
  asset is rejected, and the worst case is the same. An archive that a later asset refuses would
  also cost hashing.

## References

- `docs/specs/2026-11-15-session-layer-and-document-identity.md`, section 5.6.
- `docs/specs/2026-06-10-vernacular-floor-plan-format.md`, section 2.3.
- `docs/plans/2026-11-15-session-layer-and-document-identity.md`, the section on assets that travel
  with documents.
- ADR-0007 (content-addressed assets), ADR-0042 (the asset pool), ADR-0047 (the published format),
  ADR-0003 (the typed results of an import), ADR-0190 (the interim rule under which a document with
  format faults still opens).
- Issues #673 and #672.
