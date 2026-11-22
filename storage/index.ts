export type { ProjectStore, ProjectSummary } from './project-store'
export { ProjectNotFoundError } from './project-store'
export type { LibraryItemSummary, LibraryStore } from './library-store'
export type { AssetCache } from './asset-cache'
export { InMemoryAssetCache } from './in-memory-asset-cache'
export { ASSET_DIRECTORY_PREFIX, DirectoryAssetCache } from './directory-asset-cache'
export type { AssetSource, LibraryItem } from './assets/asset-source'
export { InMemoryAssetSource } from './assets/in-memory-asset-source'
export { CacheAssetSource } from './assets/cache-asset-source'
export { PackSource } from './assets/pack-source'
export type { PackReader } from './assets/pack-source'
export { createFetchPackReader } from './assets/fetch-pack-reader'
export { UserSource } from './assets/user-source'
export type { UserLibraryIndex, UserAssetMeta } from './assets/user-source'
export { AssetRegistry } from './assets/asset-registry'
export type { ScopedAssetSource, AssetRegistryOptions } from './assets/asset-registry'
export type { ProjectStorage } from './project-storage'
export { createOpfsProjectStorage, createDefaultProjectStorage } from './project-storage'
export { InMemoryProjectStore } from './in-memory-project-store'
export { IndexedDbProjectStore } from './indexeddb/indexeddb-project-store'
export { IndexedDbDirectory } from './indexeddb/indexeddb-directory'
export { IndexedDbUserLibraryIndex } from './indexeddb/indexeddb-user-library-index'
export {
  probeStorageCapabilities,
  isStorageDegraded,
  summarizeStorageCapabilities,
} from './storage-capabilities'
export type { StorageCapabilities, StorageProbeHost } from './storage-capabilities'
export type { SettingsPort } from './settings/settings-port'
export { InMemorySettingsPort } from './settings/in-memory-settings-port'
export { LocalStorageSettingsPort } from './settings/local-storage-settings-port'
export { originPrivateRoot } from './opfs/origin-private-root'
export { opfsUsable } from './opfs/opfs-probe'
export { registerServiceWorker } from './service-worker/register-service-worker'
export type {
  ServiceWorkerContainerLike,
  ServiceWorkerRegistrationOutcome,
  RegisterServiceWorkerOptions,
} from './service-worker/register-service-worker'
export type { DirectoryPort } from './fs/directory-port'
export { InMemoryDirectory } from './fs/in-memory-directory'
export { FileSystemDirectory } from './fs/file-system-directory'
export { SubdirectoryPort } from './fs/subdirectory-port'
export type { ProjectFiles, RemovableProjectFiles } from './project-files/project-files'
export type { ProjectLocation } from './project-files/project-location'
export {
  PROJECT_FILE,
  secondDocumentFileName,
  secondDocumentFileVersion,
} from './project-files/project-file-name'
export { InvalidProjectIdError } from './project-files/project-id-guard'
export { WorkspaceFiles } from './project-files/workspace-files'
export { FolderFiles } from './project-files/folder-files'
export { DocumentDecodeError } from './documents/document-decode-error'
export { DocumentStore, WorkspaceDocumentStore } from './documents/document-store'
export type {
  ReplaceReport,
  SaveReport,
  StoreRead,
  StoreReadFailure,
} from './documents/document-store'
export type { SecondFileState } from './documents/second-file'
export type { ProjectSnapshots } from './documents/project-snapshots'
export { OpfsProjectStore, createOpfsProjectStore } from './opfs/opfs-project-store'
export { ZipBundleProjectStore } from './zip/zip-bundle-project-store'
export { collectReferencedAssets } from './project-files/referenced-assets'
export { exportProjectBundle } from './zip/export-project-bundle'
export type { ExportedBundle, ExportProjectBundleOptions } from './zip/export-project-bundle'
export { ARCHIVE_LIMITS } from './zip/archive-limits'
export type { ArchiveLimits, ArchiveLimitName } from './zip/archive-limits'
export { readArchive } from './zip/read-archive'
export type { ArchiveRead, ArchiveFailure } from './zip/read-archive'
export { isContentHash } from './zip/archive-layout'
export { buildUncheckedCopy } from './zip/unchecked-copy'
export type { UncheckedCopy } from './zip/unchecked-copy'
export { neededAssetHashes, packSuppliesFrom } from './zip/needed-assets'
export type { PackSupplies } from './zip/needed-assets'
export { copyImportedAssets } from './import/copy-imported-assets'
export { removableAssets } from './assets/removable-assets'
export type { AssetUser } from './assets/removable-assets'
export { FileSystemFolderProjectStore } from './filesystem/file-system-folder-project-store'
export { DirectoryHandleStore } from './filesystem/directory-handle-store'
export type { FolderAccess, FolderHandles, RememberedFolder } from './filesystem/folder-access'
export { BrowserFolderAccess, InMemoryFolderAccess } from './filesystem/folder-access'
export { SnapshotStore } from './snapshots/snapshot-store'
export type { SnapshotStoreOptions } from './snapshots/snapshot-store'
export { InMemoryProjectLockPort, WebLocksProjectLockPort } from './locks/project-lock'
export type { ProjectLockHold, ProjectLockPort } from './locks/project-lock'
export { selectProjectStoreBackend } from './select-project-store'
export type {
  ProjectBackend,
  ProjectStoreBackend,
  SelectProjectStoreOptions,
} from './select-project-store'
export { bundleFilename } from './zip/bundle-filename'
export { svgPlanFilename } from './download/svg-plan-filename'
export { pngPlanFilename } from './download/png-plan-filename'
export { rasterTargetSize } from './download/raster-target-size'
export { rasterizeSvgToPng, DEFAULT_RASTER_MAX_EDGE } from './download/rasterize-svg'
export { pdfPlanFilename } from './download/pdf-plan-filename'
export { pdfPageSize } from './download/pdf-page'
export { placePlanOnPage } from './download/pdf-plan-layout'
export {
  svgPlanToPdf,
  PRINT_RASTER_MAX_EDGE,
  PDF_DEFAULT_MARGIN_PT,
} from './download/pdf-plan-document'
export type { SvgPlanToPdfOptions } from './download/pdf-plan-document'
export { downloadBytes, downloadText } from './download/download-blob'
export { importProjectFile } from './import/import-project-file'
export type { ProjectFileRead, ProjectFileFailure } from './import/import-project-file'
export { isValidProjectId, newProjectId } from './active-project/project-id'
export {
  readLegacyActiveProjectId,
  removeLegacyActiveProjectId,
} from './active-project/legacy-active-project-id'
export type { ProjectRecord, ProjectIndex } from './project-index/project-index'
export { InMemoryProjectIndex } from './project-index/in-memory-project-index'
export { IndexedDbProjectIndex } from './project-index/indexeddb-project-index'
export { hasSwitchedToMemory, withMemoryFallback } from './project-index/with-memory-fallback'
