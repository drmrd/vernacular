/** Why a project did not open, as far as the person at the screen needs to know. */
export type FailedOpenCause =
  | 'format-rules'
  | 'newer-version'
  | 'not-a-project'
  | 'migration-failed'
  | 'storage-unavailable'
  | 'folder-unavailable'
  | 'file-too-large'

/** Where the project that did not open came from: the stored projects, or a file the user chose. */
export type FailedOpenSource = 'stored' | 'file'

/**
 * The plain sentence that names a cause, for the person at the screen. A file that the user chose
 * is named as a file, a stored project as the stored file. Default 'stored'.
 */
export function causeSentence(cause: FailedOpenCause, source: FailedOpenSource = 'stored'): string {
  switch (cause) {
    case 'format-rules':
      return 'A part of the project breaks the format rules.'
    case 'newer-version':
      return 'A newer version of Vernacular made this project.'
    case 'not-a-project':
      return source === 'file'
        ? 'The file is not a Vernacular project.'
        : 'The stored file is not a Vernacular project.'
    case 'migration-failed':
      return 'Vernacular could not bring this project up to the current format.'
    case 'storage-unavailable':
      return 'The storage did not answer.'
    case 'folder-unavailable':
      return 'The folder is not available.'
    case 'file-too-large':
      return 'The file is larger than Vernacular can open.'
  }
}
