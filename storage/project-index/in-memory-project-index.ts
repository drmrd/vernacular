import type { ProjectIndex, ProjectRecord } from './project-index'

/** A project index kept in memory, for tests and for a workspace that ends with the tab. */
export class InMemoryProjectIndex implements ProjectIndex {
  private readonly records = new Map<string, ProjectRecord>()

  async all(): Promise<ProjectRecord[]> {
    const ids = [...this.records.keys()].sort()
    return ids.map((id) => structuredClone(this.records.get(id) as ProjectRecord))
  }

  async get(id: string): Promise<ProjectRecord | undefined> {
    const record = this.records.get(id)
    return record === undefined ? undefined : structuredClone(record)
  }

  async put(record: ProjectRecord): Promise<void> {
    this.records.set(record.id, structuredClone(record))
  }

  async remove(id: string): Promise<void> {
    this.records.delete(id)
  }
}
