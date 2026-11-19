import type { SettingsPort } from './settings-port'

/** Keeps each setting as JSON text, so a read behaves exactly like a read of the browser port. */
export class InMemorySettingsPort implements SettingsPort {
  private readonly texts = new Map<string, string>()

  read(name: string): unknown {
    const text = this.texts.get(name)
    return text === undefined ? undefined : (JSON.parse(text) as unknown)
  }

  write(name: string, value: unknown): void {
    const text = JSON.stringify(value) as string | undefined
    if (text === undefined) {
      this.texts.delete(name)
      return
    }
    this.texts.set(name, text)
  }
}
