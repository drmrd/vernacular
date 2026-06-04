/**
 * Prefix shared by every version of the application-shell cache. Cleanup uses it
 * to recognize caches this app owns without disturbing caches from other origins
 * or tools.
 */
export const SHELL_CACHE_PREFIX = 'vernacular-shell-'

/**
 * The shell-cache schema version. Bumped by hand when the precache contents change.
 * The release-coupled versioning approach is deferred (design specification section 11).
 */
export const SHELL_CACHE_VERSION = 1

/** The cache name for a given shell-cache version. */
export function shellCacheName(version: number = SHELL_CACHE_VERSION): string {
  return `${SHELL_CACHE_PREFIX}v${version}`
}

/** The shell caches that are not the current one and so should be purged on activate. */
export function staleShellCacheNames(
  existingNames: readonly string[],
  current: string = shellCacheName(),
): string[] {
  return existingNames.filter((name) => name.startsWith(SHELL_CACHE_PREFIX) && name !== current)
}
