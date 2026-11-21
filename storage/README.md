# storage/

Project, library, and asset persistence. Provider-shaped from day one: `ProjectStore`,
`LibraryStore`, and `AssetCache` are interfaces with multiple implementations. This layer
depends only on `core/`. Browser storage APIs are used only inside this layer. User settings go
through `SettingsPort` (`storage/settings/`), an interface with `LocalStorageSettingsPort` over the
browser's local storage and `InMemorySettingsPort`; the first start carries the snap preferences
that an older build kept under their old key. `ProjectIndex` (`storage/project-index/`) keeps one
record per project, which the recent list and the start read. It has `IndexedDbProjectIndex` and
`InMemoryProjectIndex`, and a wrapper answers from memory when the browser's index cannot be read. See ADR-0001, ADR-0180, and the design specification,
section 5.
