import { createEmptyProject, createFloor, type Project } from '../core'
import { version as appVersion } from '../package.json'

// createEmptyProject starts with no floors; the app seeds a ground floor so the wall tool has a target.
export function createInitialProject(): Project {
  const project = createEmptyProject({
    name: 'Untitled project',
    units: 'imperial',
    period: 'modern',
    appVersion,
  })
  return { ...project, floors: [createFloor('Ground')] }
}
