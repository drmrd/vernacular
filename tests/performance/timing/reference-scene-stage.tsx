import { useMemo, type ReactElement, type ReactNode } from 'react'
import {
  ActiveFloorProvider,
  EditorSessionProvider,
  EnvironmentSessionProvider,
  PerceivedColorProvider,
  SceneSessionProvider,
  SelectionProvider,
  createActiveFloorStore,
  createPerceivedColorStore,
  createSelectionStore,
  type EditorSession,
  type EnvironmentSessionStore,
  type SceneSessionStore,
} from '../../../bridge'

const ACTIVE_FLOOR_ID = 'floor-1'

/** The stores the timing page owns and the live view reads: it drives them between variants. */
export interface ReferenceSceneStores {
  readonly session: EditorSession
  readonly environment: EnvironmentSessionStore
  readonly sceneSession: SceneSessionStore
}

/** The props of {@link ReferenceSceneProviders}. */
export interface ReferenceSceneProvidersProps {
  readonly stores: ReferenceSceneStores
  readonly children: ReactNode
}

/**
 * The providers the live 3D view needs, fed by the given stores: the editor session, the
 * selection (empty), the active floor (`floor-1`), the environment session, the scene
 * session, and the perceived color. The order follows the app's stack. The asset providers
 * are left out: the reference project has no model assets, so the live view draws furniture
 * as boxes. The stage does not mount the 3D canvas itself; the page puts it inside.
 */
export function ReferenceSceneProviders({
  stores,
  children,
}: ReferenceSceneProvidersProps): ReactElement {
  const selection = useMemo(() => createSelectionStore(), [])
  const activeFloor = useMemo(() => createActiveFloorStore(ACTIVE_FLOOR_ID), [])
  const perceivedColor = useMemo(() => createPerceivedColorStore(), [])
  return (
    <EditorSessionProvider session={stores.session}>
      <SelectionProvider store={selection}>
        <ActiveFloorProvider store={activeFloor}>
          <PerceivedColorProvider store={perceivedColor}>
            <EnvironmentSessionProvider store={stores.environment}>
              <SceneSessionProvider store={stores.sceneSession}>{children}</SceneSessionProvider>
            </EnvironmentSessionProvider>
          </PerceivedColorProvider>
        </ActiveFloorProvider>
      </SelectionProvider>
    </EditorSessionProvider>
  )
}
