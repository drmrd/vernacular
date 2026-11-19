export interface SettingsPort {
  /** Synchronous, so the theme is known before the first paint. */
  read(name: string): unknown
  write(name: string, value: unknown): void
}
