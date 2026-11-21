/** Why a project did not open, as far as the person at the screen needs to know. */
export type FailedOpenCause =
  | 'format-rules'
  | 'newer-version'
  | 'not-a-project'
  | 'migration-failed'
  | 'storage-unavailable'
  | 'folder-unavailable'

export function causeSentence(cause: FailedOpenCause): string {
  switch (cause) {
    case 'format-rules':
      return 'A part of the project breaks the format rules.'
    case 'newer-version':
      return 'A newer version of Vernacular made this project.'
    case 'not-a-project':
      return 'The stored file is not a Vernacular project.'
    case 'migration-failed':
      return 'Vernacular could not bring this project up to the current format.'
    case 'storage-unavailable':
      return 'The storage did not answer.'
    case 'folder-unavailable':
      return 'The folder is not available.'
  }
}
