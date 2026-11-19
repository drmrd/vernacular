# storage/

Project, library, and asset persistence. Provider-shaped from day one: `ProjectStore`,
`LibraryStore`, and `AssetCache` are interfaces with multiple implementations. This layer
depends only on `core/`. Browser storage APIs are used only inside this layer. User settings go
through `SettingsPort` (`storage/settings/`), an interface with `LocalStorageSettingsPort` over the
browser's local storage and `InMemorySettingsPort`; the first start carries the snap preferences
that an older build kept under their old key. See ADR-0001, ADR-0180, and the design specification,
section 5.
