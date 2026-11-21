/**
 * Whether the end-to-end runtime flag is set: `?e2e` in the URL's search. It is a runtime flag,
 * not a build-time gate, so it survives the production preview build the end-to-end tests run
 * against, which a dev-only gate would strip. Off by default; the test-only probes stay inert.
 */
export function e2eRuntimeFlagSet(search: string): boolean {
  return new URLSearchParams(search).has('e2e')
}
