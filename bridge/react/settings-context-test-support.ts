import { createElement, type ReactElement } from 'react'
import type { SettingKey, SettingsService } from '../../session'
import { useSetting, useSettingsService } from './settings-context'
import type { Recording } from './settings-context-fixtures-test-support'

/**
 * Reader components of the tests of the settings provider and hooks. They are built with
 * `createElement` in a `.ts` file, so that this support module exports no component of the
 * application.
 */

interface ReaderProps<T> {
  settingKey: SettingKey<T>
  seen: Recording<T>
}

/** Renders the value of `settingKey` as a status output, and records each render in `seen`. */
export function Reader<T>({ settingKey, seen }: ReaderProps<T>): ReactElement {
  const [value, setValue] = useSetting(settingKey)
  seen.values.push(value)
  seen.setters.push(setValue)
  return createElement('output', null, String(value))
}

/** Records the service that each render of the component gets. */
export function ServiceProbe({ services }: { services: SettingsService[] }): null {
  services.push(useSettingsService())
  return null
}
