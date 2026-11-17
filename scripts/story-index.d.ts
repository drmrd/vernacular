// Type declarations for story-index.mjs (the Storybook index.json reader) so its
// test can import it under the strict TypeScript config (allowJs is off, so an
// untyped .mjs import would otherwise be an error). It is a .d.ts file because the
// test imports the module without an extension, which TypeScript resolves to .d.ts only.

/**
 * Read the ids of the testable stories from the TEXT of a built Storybook
 * `index.json`: only `story` entries tagged `test`, sorted ascending. Throws
 * when the text is not valid JSON.
 */
export function readStoryIds(indexJsonText: string): string[]
