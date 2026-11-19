import { useState, type ReactElement, type ReactNode } from 'react'
import { SettingsProvider } from '../bridge'
import { createSettingsService } from '../session'
import { LocalStorageSettingsPort, type SettingsPort } from '../storage'

export interface AppSettingsProps {
  /** The port of the user settings. With none, the settings that this browser keeps. */
  port?: SettingsPort | undefined
  children: ReactNode
}

/**
 * Gives one settings service to the application below it. The service is built once, at the
 * first render, so a later change of `port` is ignored. With no port it reads the settings that
 * this browser keeps; building that port carries the preferences an older build stored.
 */
export function AppSettings({ port, children }: AppSettingsProps): ReactElement {
  const [service] = useState(() => createSettingsService(port ?? new LocalStorageSettingsPort()))
  return <SettingsProvider service={service}>{children}</SettingsProvider>
}
