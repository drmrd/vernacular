export interface SettingsPort {
  /** Synchronous, so the theme is known before the first paint. */
  read(name: string): unknown
  write(name: string, value: unknown): void
  /**
   * Tells the listener the name of each setting that something outside this port changed, for
   * example another browser tab. The returned function removes the listener.
   */
  onOutsideChange?(listener: (name: string) => void): () => void
}
