import type { Project } from '../core'

export interface ProjectSummary {
  id: string
  name: string
}

export interface ProjectStore {
  list(): Promise<ProjectSummary[]>
  load(id: string): Promise<Project>
  save(id: string, project: Project): Promise<void>
  delete(id: string): Promise<void>
}
