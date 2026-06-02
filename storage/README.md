# storage/

Project, library, and asset persistence. Provider-shaped from day one: `ProjectStore`,
`LibraryStore`, and `AssetCache` are interfaces with multiple implementations. This layer
depends only on `core/`. Browser storage APIs are used only inside this layer. See ADR-0001
and the design specification, section 5.
