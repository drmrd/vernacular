import type { Project } from '../../core'
import { ProjectNotFoundError, type ProjectStore, type ProjectSummary } from '../project-store'

const DB_NAME = 'vernacular'
const STORE_NAME = 'projects'
const DB_VERSION = 1

interface StoredProject {
  id: string
  project: Project
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
  })
}

/**
 * Durable ProjectStore backed by IndexedDB. This is the single seam that touches
 * IndexedDB; it is validated by the wall-drawing end-to-end spec rather than unit
 * tests, since jsdom does not implement IndexedDB.
 */
export class IndexedDbProjectStore implements ProjectStore {
  async list(): Promise<ProjectSummary[]> {
    const db = await openDatabase()
    const records = await promisify(
      db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll() as IDBRequest<
        StoredProject[]
      >,
    )
    return records.map((record) => ({ id: record.id, name: record.project.meta.name }))
  }

  async load(id: string): Promise<Project> {
    const db = await openDatabase()
    const record = await promisify(
      db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id) as IDBRequest<
        StoredProject | undefined
      >,
    )
    if (record === undefined) {
      throw new ProjectNotFoundError(id)
    }
    return record.project
  }

  async save(id: string, project: Project): Promise<void> {
    const db = await openDatabase()
    const record: StoredProject = { id, project }
    await promisify(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record))
  }

  async delete(id: string): Promise<void> {
    const db = await openDatabase()
    await promisify(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id))
  }
}

/** The default durable store for the running app. */
export function createDefaultProjectStore(): ProjectStore {
  return new IndexedDbProjectStore()
}
