/**
 * Where a project is kept: in the browser's workspace, or in a folder that the user picked. The
 * folder's name is for display only.
 */
export type ProjectLocation =
  | { readonly kind: 'workspace' }
  | { readonly kind: 'folder'; readonly folderName: string }
