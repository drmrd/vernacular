import { Suspense, type ReactElement } from 'react'
import { SceneCanvas } from '../../../../bridge'
import { ReferenceSceneProviders, type ReferenceSceneStores } from '../reference-scene-stage'

/**
 * The real live 3D view of the app inside the reference providers. As in the app's scene pane, the
 * canvas waits in `Suspense` while its renderer module loads.
 */
export function LiveView({ stores }: { stores: ReferenceSceneStores }): ReactElement {
  return (
    <ReferenceSceneProviders stores={stores}>
      <Suspense fallback={<p>Loading the 3D view</p>}>
        <SceneCanvas />
      </Suspense>
    </ReferenceSceneProviders>
  )
}
