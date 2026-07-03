import {
  useActiveFloorId,
  useEditorSession,
  useEnvironmentSession,
  useProjectEnvironmentScenes,
  useSceneGraph,
} from '../../bridge'
import {
  builtinPeriods,
  formatAdaptiveLength,
  preferencesForUnits,
  sceneGraphForFloor,
  type Project,
} from '../../core'
import { EnvironmentPanel } from '../environment/environment-panel'
import { EnvironmentScenes } from '../environment/environment-scenes'
import { LibraryLauncherPanel } from '../library/library-launcher-panel'
import { SiteEditor } from '../metadata/site-editor'
import { OpeningTypeChooser } from '../plan/opening-type-chooser'
import { UnderlayMenuPanel } from '../plan/underlay-menu-panel'
import { planExtent } from '../plan/fit'
import { useActiveTool } from '../tools/active-tool-context'
import { ToolsPanel } from '../tools/tools-panel'
import { EditLayerPanel } from '../tools/edit-layer-panel'
import { SectionLabel } from '../design-system'
import { OverallDimensions } from './overall-dimensions'
import { ProjectIdentity } from './project-identity'

// The tools nav: the tool buttons, plus the opening-type chooser surfaced only
// while the place-opening tool is active so the user picks what to place.
function ToolsNav() {
  const { tool } = useActiveTool()
  return (
    <nav className="editor-shell__tools" aria-label="Tools">
      <ToolsPanel />
      {tool === 'place-opening' ? <OpeningTypeChooser /> : null}
    </nav>
  )
}

// The italic period subtitle for the rail project block: the era's display name
// and its approximate range, drawn from the period registry.
function railPeriodLabel(period: string): string | undefined {
  const entry = builtinPeriods.entries[period]
  if (entry === undefined) {
    return undefined
  }
  const name = entry.displayName?.['en-US'] ?? period
  return entry.approximateRange ? `${name}, ${entry.approximateRange}` : name
}

// The SiteEditor seeds its inputs at mount, so remount it (via key) whenever the persisted
// site identity changes, for example after undo, so the fields reflect the model.
function siteEditorKey(site: Project['site']): string {
  return JSON.stringify(site ?? {})
}

// The rail's Environment section: the panel reads and writes the shared
// environment session so the 3D viewport reflects the controls live.
function EnvironmentRailSection({ site }: { site: Project['site'] }) {
  const session = useEditorSession()
  const { environment, setEnvironment } = useEnvironmentSession()
  const scenes = useProjectEnvironmentScenes()
  return (
    <section aria-label="Environment">
      <SectionLabel>Environment</SectionLabel>
      <EnvironmentPanel
        site={site}
        environment={environment}
        onEnvironmentChange={setEnvironment}
      />
      <EnvironmentScenes
        scenes={scenes}
        environment={environment}
        onEnvironmentChange={setEnvironment}
        dispatch={session.dispatch}
      />
    </section>
  )
}

// The tool rail content: the project identity block above the drawing and editing
// tools. It subscribes to the scene graph so the block refreshes on project edits.
export function ToolRail() {
  const session = useEditorSession()
  const fullGraph = useSceneGraph()
  const floorId = useActiveFloorId()
  const project = session.getProject()
  // Narrow to the active floor so the readout measures the same content the canvas
  // draws, not every floor stacked together.
  const graph = sceneGraphForFloor(fullGraph, floorId)
  const extent = planExtent(graph.walls, graph.rooms)
  const preferences = preferencesForUnits(project.meta.units)
  const overall =
    extent === null
      ? null
      : {
          width: formatAdaptiveLength(extent.width, preferences),
          height: formatAdaptiveLength(extent.height, preferences),
        }
  return (
    <div className="editor-shell__rail">
      <ProjectIdentity
        name={project.meta.name}
        periodLabel={railPeriodLabel(project.meta.period)}
      />
      <ToolsNav />
      <EditLayerPanel />
      <OverallDimensions extent={overall} />
      <LibraryLauncherPanel />
      <UnderlayMenuPanel />
      {/* Site renders inline, while Environment is its own component so its
          useEnvironmentSession subscription re-renders only that section rather
          than the whole rail on every environment change. */}
      <section aria-label="Site">
        <SectionLabel>Site</SectionLabel>
        <SiteEditor
          key={siteEditorKey(project.site)}
          site={project.site ?? {}}
          dispatch={session.dispatch}
        />
      </section>
      <EnvironmentRailSection site={project.site} />
    </div>
  )
}
