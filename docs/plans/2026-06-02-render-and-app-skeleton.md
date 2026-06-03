# Render and App Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This repository overrides the generic single-implementer flow with its own role-separated red-green-blue cycle (see `.claude/rules.md` rules 14 and 15 and `CLAUDE.md`): each behavior runs RED (the `test-author` subagent writes the failing test), GREEN (the `implementer` subagent writes the minimal implementation; it never reads the test), then BLUE (the `clean-code-reviewer` audits the diff and the `refactorer` applies findings; the phase closes with a `refactor:` marker commit, empty if there are no implementation findings). Tasks marked **(infrastructure)** are not behaviors: they have no single unit under test and are carried by the controller directly with a conventional commit, verified by the existing suite plus `pnpm typecheck`.

**Goal:** Stand up the top four layers of the six-layer architecture: `engine/` (the only Three.js importer), `bridge/` (R3F glue and the single dispatch boundary), `editor/` (the React shell with placeholder panels), and `app/` (the composition root). The 3D renderer skeleton renders an empty scene on WebGPU and degrades to an accessible fallback where WebGPU is unavailable.

**Architecture:** The `engine/` layer turns the pure `core/` scene graph into a Three.js object tree (`buildScene`), supplies lights behind a `LightingProvider` seam (`BasicLightingProvider`), detects the render backend, and owns the one WebGPU renderer factory; it is the only layer that imports `three`. The `bridge/` layer wraps the core `Dispatcher` in a single `EditorSession` (the only place outside `core/commands/` that dispatches), exposes it to React through a context, and mounts the R3F `<Canvas>`; it imports `@react-three/fiber` and `engine`, never `three` directly. The `editor/` layer renders the shell landmarks and hosts the viewport. The `app/` layer composes a session over an empty project and renders the shell. The renderer and the shell consume the memoized scene graph that landed in PR #16.

**Tech Stack:** React 19 + `react-dom` 19, `three` 0.184 with the `three/webgpu` `WebGPURenderer`, `@react-three/fiber` 9 (its first-class WebGPU path requires React 19), `@types/three` 0.184, `@webgpu/types`. TypeScript (strict, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest + Testing Library for unit tests in jsdom. All new dependencies resolve to releases older than the 15-day cooldown (`three` 0.184.0 published 2026-04-16, `@react-three/fiber` 9.6.1 published 2026-04-28, React 19 stable, `@webgpu/types` 0.1.70 published 2026-05-11).

**Scope boundary:** This plan is the third and last of three that together deliver the full six-layer source skeleton. It builds on the first (core domain and registries, PR #15) and the second (command dispatch and scene graph, PR #16). It does NOT add a `Wall` entity, a wall-drawing tool, snapping, dimensions, or openings (the proof-of-life work and Phase 1). It does NOT add selection state, gizmos, or hit testing (those arrive with the first selectable entity). It does NOT add the 2D Canvas plan renderer, the `PaintMaterial`, the color-temperature slider, camera controls, or walk mode. It does NOT add the WebGL2 fallback renderer (a later phase per design spec 6.3) or the `engine/profiling/` harness. It does NOT add IndexedDB autosave, a service worker, or i18n wiring. It does NOT modify `docs/specs/`.

---

## Design notes

### Why React 19 + React-Three-Fiber 9

Design spec 6.3 names "Three.js + React-Three-Fiber + WebGPURenderer" as the primary 3D renderer. The supported, first-class WebGPU integration in R3F is version 9, whose `<Canvas gl={...}>` awaits an async renderer factory so a `three/webgpu` `WebGPURenderer` (which requires `await renderer.init()`) can be returned directly. R3F 9 peer-requires React 19. The repository was on React 18, so this plan bumps React to 19 first. The migration blast radius is one component (`src/App.tsx`) plus the entry point, because the source skeleton is otherwise empty; doing the bump now is far cheaper than after the UI grows. This decision was confirmed with the project owner. ADR-0004 records the renderer-stack decision and ADR-0019 records the bridge dispatch boundary.

### Layering and the Three.js import boundary

Hard invariant 2: `engine/` is the only layer that imports `three`. The boundary is honored precisely:

- `engine/` imports `three` and `three/webgpu`. It exposes `buildScene`, the lighting provider, backend detection, and the renderer factory. The Three.js object type leaks out only as the `engine`-owned `SceneRoot` alias, so consumers name an engine type rather than a `three` type.
- `bridge/` imports `@react-three/fiber` (the React renderer binding, a separate package) and `engine`. It never imports `three` or `three/webgpu` directly. The `<primitive object={...}>` it renders is typed through R3F and `engine`'s `SceneRoot`.
- `editor/` imports `bridge` (for `SceneCanvas`); `app/` imports `bridge`, `editor`, and `core`. The `eslint-plugin-boundaries` element map already encodes this stack (`engine → {core, storage}`, `bridge → {core, storage, engine}`, `editor → +bridge`, `app → all below`); no ESLint change is needed.

### Keeping WebGPU out of the test import graph

jsdom has no GPU, so no real rendering is unit-tested. The plan isolates every GPU-touching line into two files that are never rendered or executed under Vitest:

- `engine/renderer/create-renderer.ts` constructs the `WebGPURenderer`. It imports the renderer type-only (erased at runtime) and `await import('three/webgpu')` lazily inside the function, so importing the `engine` barrel never loads the WebGPU build.
- `bridge/react/webgpu-scene-view.tsx` mounts the R3F `<Canvas>`. It is rendered only by `SceneCanvas` when `detectRenderBackend() === 'webgpu'`, which is never true in jsdom.

`SceneCanvas` itself is unit-tested: in jsdom it always takes the fallback branch and renders an accessible status message, so the editor shell and the app render cleanly in tests and in any browser without WebGPU. The empty-scene render on WebGPU is exercised by the dev server and Storybook in a capable browser, not by unit tests. These two glue files are excluded from coverage reporting; there is no coverage threshold gate, so this does not fail CI.

### Files

| File                                                      | Purpose                                                                           |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `engine/scene/build-scene.ts` / `.test.ts`                | `SceneRoot`, `buildScene(graph)`: scene graph to a Three.js group tree            |
| `engine/lighting/lighting-provider.ts`                    | `LightingProvider` interface (the phase-8 solar provider swaps in here)           |
| `engine/lighting/basic-lighting-provider.ts` / `.test.ts` | `BasicLightingProvider`: MVP directional sun + hemisphere fill                    |
| `engine/renderer/detect-backend.ts` / `.test.ts`          | `RenderBackend`, `detectRenderBackend()`: webgpu vs unsupported                   |
| `engine/renderer/create-renderer.ts`                      | `createSceneRenderer()`: the one WebGPU renderer factory (lazy `three/webgpu`)    |
| `engine/index.ts`, `engine/README.md`                     | Engine public barrel and layer note                                               |
| `bridge/session/editor-session.ts` / `.test.ts`           | `EditorSession`, `createEditorSession(project)`: the single dispatch boundary     |
| `bridge/react/editor-session-context.ts`                  | `EditorSessionContext`, `useEditorSession()`                                      |
| `bridge/react/editor-session-provider.tsx`                | `EditorSessionProvider`                                                           |
| `bridge/react/editor-session-context.test.tsx`            | Tests for the provider/hook contract                                              |
| `bridge/react/webgpu-scene-view.tsx`                      | The R3F `<Canvas>` mount (untested glue)                                          |
| `bridge/react/scene-canvas.tsx` / `.test.tsx`             | `SceneCanvas`: WebGPU-gated viewport with an accessible fallback                  |
| `bridge/index.ts`, `bridge/README.md`                     | Bridge public barrel and layer note                                               |
| `editor/shell/editor-shell.tsx` / `.test.tsx`             | `EditorShell`: toolbar, tools, viewport, inspector landmarks                      |
| `editor/index.ts`, `editor/README.md`                     | Editor public barrel and layer note                                               |
| `app/app.tsx` / `.test.tsx`, `app/app.stories.tsx`        | `App`: composes the session and renders the shell                                 |
| `app/index.ts`, `app/README.md`                           | App public barrel and layer note                                                  |
| `src/main.tsx`                                            | Entry point re-pointed at `app/`                                                  |
| `package.json`, `pnpm-lock.yaml`                          | React 19 + Three.js + R3F dependencies                                            |
| `tsconfig.json`, `vite.config.ts`, `.storybook/main.ts`   | Include the new layers; type WebGPU; relocate the story glob                      |
| `ROADMAP.md`                                              | Six-layer source skeleton row marked done                                         |
| `docs/knowledge/` (local, gitignored)                     | ADR-0004 (renderer stack) refreshed; ADR-0019 (bridge dispatch boundary) authored |
| `.superpowers/scratch/progress.md` (local)                | Capture merge SHA; mark the source skeleton complete                              |

---

## Tasks

### Task 1: Branch and commit the plan (infrastructure)

**Files:** Create `docs/plans/2026-06-02-render-and-app-skeleton.md` (this document).

- [ ] **Step 1: Confirm a clean tree on an up-to-date branch off main**

```
pwd
git status --short
git rev-parse --abbrev-ref HEAD
```

Expected: directory is `/Users/dan/workspace/vernacular`; the branch is `feat/render-and-app-skeleton` created from `main` at the PR #16 merge commit (`d076ad4`); the working tree carries only this new plan file. If anything else differs, STOP and report BLOCKED with what was found.

- [ ] **Step 2: Commit the plan**

```
git add docs/plans/2026-06-02-render-and-app-skeleton.md
git commit -m "docs: plan the render and app skeleton"
```

---

### Task 2: Adopt React 19 and add the renderer dependencies (infrastructure)

**Files:** Modify `package.json`, `tsconfig.json`, `vite.config.ts`, `.storybook/main.ts`. Regenerate `pnpm-lock.yaml`.

This task changes no behavior: the existing `src/App.tsx`, its test, and its story are the regression guard and must stay green under React 19.

- [ ] **Step 1: Edit `package.json` dependency ranges**

In `dependencies`, change `react` and `react-dom` to `^19.0.0` and add the renderer runtime deps:

```jsonc
"dependencies": {
  "@react-three/fiber": "^9.6.1",
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "three": "^0.184.0"
}
```

In `devDependencies`, move `@types/react`/`@types/react-dom` to React 19, bump Testing Library for React 19 support, and add the type packages:

```jsonc
"@testing-library/react": "^16.1.0",
"@types/react": "^19.0.0",
"@types/react-dom": "^19.0.0",
"@types/three": "^0.184.0",
"@webgpu/types": "^0.1.70",
```

Leave every other dependency unchanged. The `pnpm.overrides` block and `minimum-release-age` cooldown stay as they are; pnpm will resolve each caret range to the newest release at least 15 days old.

- [ ] **Step 2: Install and let the cooldown resolve versions**

Run: `pnpm install`
Expected: install succeeds with no cooldown rejection. `react` and `react-dom` resolve to the same 19.x patch. If pnpm reports a peer-dependency conflict for `@react-three/fiber` (it peer-requires `react >=19 <19.3`), confirm the resolved React is in range; do not add overrides. If install fails on the cooldown for any transitive package, STOP and report BLOCKED with the package and its publish date.

- [ ] **Step 3: Include the new layers and type WebGPU in `tsconfig.json`**

Extend `include` and add `@webgpu/types` to `compilerOptions.types`:

```jsonc
"types": ["vitest/globals", "@testing-library/jest-dom", "@webgpu/types"]
```

```jsonc
"include": ["src", "tests", "core", "storage", "engine", "bridge", "editor", "app"]
```

The four new globs match no files yet; that is fine.

- [ ] **Step 4: Extend coverage globs in `vite.config.ts`**

Set the coverage `include` and `exclude` so the new layers are measured and the two GPU glue files plus stories are not:

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'html', 'lcov'],
  include: [
    'src/**/*.{ts,tsx}',
    'core/**/*.{ts,tsx}',
    'storage/**/*.{ts,tsx}',
    'engine/**/*.{ts,tsx}',
    'bridge/**/*.{ts,tsx}',
    'editor/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
  ],
  exclude: [
    '**/*.test.{ts,tsx}',
    '**/*.stories.tsx',
    'src/main.tsx',
    'src/setupTests.ts',
    'engine/renderer/create-renderer.ts',
    'bridge/react/webgpu-scene-view.tsx',
  ],
},
```

- [ ] **Step 5: Broaden the Storybook stories glob in `.storybook/main.ts`**

```ts
stories: [
  '../src/**/*.stories.@(ts|tsx)',
  '../app/**/*.stories.@(ts|tsx)',
  '../editor/**/*.stories.@(ts|tsx)',
],
```

- [ ] **Step 6: Verify the existing suite is green under React 19**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all pass. If `@types/react` 19 surfaces a type error in `src/App.tsx` or `src/main.tsx`, fix it minimally (React 19 still uses `createRoot` from `react-dom/client` and `StrictMode` from `react`; no API change is expected for this code). If anything else fails, resolve before continuing.

- [ ] **Step 7: Commit**

```
git add package.json pnpm-lock.yaml tsconfig.json vite.config.ts .storybook/main.ts
git commit -m "build(deps): adopt React 19 and add Three.js and React Three Fiber"
```

---

### Task 3: Engine - build a Three.js scene from the scene graph

**Files:** Create `engine/scene/build-scene.ts`, `engine/scene/build-scene.test.ts`.

This is the first behavior. Public surface to give the subagents:

```ts
import type { SceneGraph, SceneNode } from '../../core'
import type * as THREE from 'three'

/** Root of the engine-side Three.js object tree built from a scene graph. */
export type SceneRoot = THREE.Group

/** Builds a Three.js group tree from the pure scene graph. Each node becomes a
 *  group named by its id, carrying the id in `userData.entityId`, positioned at
 *  the node's elevation along Y. */
export function buildScene(graph: SceneGraph): SceneRoot
```

- [ ] **Step 1: RED - dispatch the `test-author` subagent**

Provide the public surface above, the `SceneGraph`/`SceneNode` shape from `core` (`SceneNode { id: string; kind: 'floor'; name: string; elevation: number }`, `SceneGraph { nodes: SceneNode[] }`), design spec 6.1 and 6.9 (meshes carry their scene-graph entity id in `userData`), and this exact test to author at `engine/scene/build-scene.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildScene } from './build-scene'
import type { SceneGraph } from '../../core'

describe('buildScene', () => {
  it('creates one group per scene node carrying its id and elevation', () => {
    const graph: SceneGraph = {
      nodes: [
        { id: 'floor:a', kind: 'floor', name: 'Ground', elevation: 0 },
        { id: 'floor:b', kind: 'floor', name: 'Upper', elevation: 2700 },
      ],
    }

    const root = buildScene(graph)

    expect(root.children).toHaveLength(2)
    const [first, second] = root.children
    expect(first?.name).toBe('floor:a')
    expect(first?.userData.entityId).toBe('floor:a')
    expect(first?.position.y).toBe(0)
    expect(second?.userData.entityId).toBe('floor:b')
    expect(second?.position.y).toBe(2700)
  })
})
```

Run: `pnpm exec vitest run engine/scene/build-scene.test.ts`
Expected: FAIL (`buildScene` not found). Commit: `test: cover building a scene from the scene graph`.

- [ ] **Step 2: GREEN - dispatch the `implementer` subagent**

Provide the public surface and the failing-test output (not the test). Target implementation at `engine/scene/build-scene.ts`:

```ts
import * as THREE from 'three'
import type { SceneGraph, SceneNode } from '../../core'

/** Root of the engine-side Three.js object tree built from a scene graph. */
export type SceneRoot = THREE.Group

function buildNode(node: SceneNode): THREE.Group {
  const group = new THREE.Group()
  group.name = node.id
  group.userData.entityId = node.id
  group.position.y = node.elevation
  return group
}

export function buildScene(graph: SceneGraph): SceneRoot {
  const root = new THREE.Group()
  for (const node of graph.nodes) {
    root.add(buildNode(node))
  }
  return root
}
```

Run: `pnpm exec vitest run engine/scene/build-scene.test.ts`
Expected: PASS. Commit: `feat: build a Three.js scene from the scene graph`.

- [ ] **Step 3: BLUE - review and refactor**

Dispatch the `clean-code-reviewer` on the diff, then the `refactorer` to apply any findings while keeping the test green. Close with `git commit --allow-empty -m "refactor: build-scene clean-code pass"` (or a real refactor commit if there were findings).

- [ ] **Step 4: Barrel** - defer; the engine barrel is written once in Task 6.

---

### Task 4: Engine - the basic lighting provider

**Files:** Create `engine/lighting/lighting-provider.ts`, `engine/lighting/basic-lighting-provider.ts`, `engine/lighting/basic-lighting-provider.test.ts`.

`lighting-provider.ts` is a one-interface infrastructure file the controller writes alongside the GREEN step; the behavior under test is `BasicLightingProvider`.

Public surface:

```ts
import type * as THREE from 'three'

/** Supplies the lights for a scene. The phase-8 solar provider swaps in here. */
export interface LightingProvider {
  apply(scene: THREE.Object3D): void
}
```

```ts
/** MVP lighting: one directional sun at a fixed angle plus a hemisphere fill. */
export class BasicLightingProvider implements LightingProvider {
  apply(scene: THREE.Object3D): void
}
```

- [ ] **Step 1: RED - dispatch the `test-author`**

Provide the surface above plus design spec 6.7 (MVP lighting is one directional sun + one hemisphere fill). Test at `engine/lighting/basic-lighting-provider.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { BasicLightingProvider } from './basic-lighting-provider'

describe('BasicLightingProvider', () => {
  it('adds a directional sun and a hemisphere fill light to the scene', () => {
    const scene = new THREE.Scene()

    new BasicLightingProvider().apply(scene)

    const directional = scene.children.filter((child) => child instanceof THREE.DirectionalLight)
    const hemisphere = scene.children.filter((child) => child instanceof THREE.HemisphereLight)
    expect(directional).toHaveLength(1)
    expect(hemisphere).toHaveLength(1)
  })
})
```

Run: `pnpm exec vitest run engine/lighting/basic-lighting-provider.test.ts`
Expected: FAIL. Commit: `test: cover the basic lighting provider`.

- [ ] **Step 2: GREEN - dispatch the `implementer`**

First the controller creates `engine/lighting/lighting-provider.ts` with the `LightingProvider` interface above (infrastructure, staged with the implementer's commit). Then the implementer writes `engine/lighting/basic-lighting-provider.ts`:

```ts
import * as THREE from 'three'
import type { LightingProvider } from './lighting-provider'

/** Pure white light; the color-temperature tint is applied at the material in a later phase. */
const WHITE = 0xffffff
/** A neutral dark ground bounce for the hemisphere fill. */
const GROUND_FILL = 0x444444
const SUN_INTENSITY = 1
const FILL_INTENSITY = 1

export class BasicLightingProvider implements LightingProvider {
  apply(scene: THREE.Object3D): void {
    const sun = new THREE.DirectionalLight(WHITE, SUN_INTENSITY)
    sun.position.set(1, 2, 1)
    const fill = new THREE.HemisphereLight(WHITE, GROUND_FILL, FILL_INTENSITY)
    scene.add(sun, fill)
  }
}
```

Run: `pnpm exec vitest run engine/lighting/basic-lighting-provider.test.ts`
Expected: PASS. Commit: `feat: add the basic lighting provider`.

- [ ] **Step 3: BLUE** - `clean-code-reviewer` then `refactorer`; close with a `refactor: basic-lighting-provider clean-code pass` marker (empty if no findings).

---

### Task 5: Engine - render backend detection

**Files:** Create `engine/renderer/detect-backend.ts`, `engine/renderer/detect-backend.test.ts`.

Public surface:

```ts
/** Which 3D backend the runtime can use. The WebGL2 fallback is a later phase. */
export type RenderBackend = 'webgpu' | 'unsupported'

/** Reports `'webgpu'` when the runtime exposes a GPU, `'unsupported'` otherwise. */
export function detectRenderBackend(): RenderBackend
```

- [ ] **Step 1: RED - dispatch the `test-author`**

Provide the surface and design spec 6.3 (the renderer detects the backend at startup; WebGL2 fallback is a fast-follow). Test at `engine/renderer/detect-backend.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest'
import { detectRenderBackend } from './detect-backend'

describe('detectRenderBackend', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports webgpu when the runtime exposes a gpu', () => {
    vi.stubGlobal('navigator', { gpu: {} })
    expect(detectRenderBackend()).toBe('webgpu')
  })

  it('reports unsupported when the runtime has no gpu', () => {
    vi.stubGlobal('navigator', {})
    expect(detectRenderBackend()).toBe('unsupported')
  })
})
```

Run: `pnpm exec vitest run engine/renderer/detect-backend.test.ts`
Expected: FAIL. Commit: `test: cover render backend detection`.

- [ ] **Step 2: GREEN - dispatch the `implementer`**

Target `engine/renderer/detect-backend.ts`:

```ts
/** Which 3D backend the runtime can use. The WebGL2 fallback is a later phase. */
export type RenderBackend = 'webgpu' | 'unsupported'

export function detectRenderBackend(): RenderBackend {
  return typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'unsupported'
}
```

Run: `pnpm exec vitest run engine/renderer/detect-backend.test.ts`
Expected: PASS. Commit: `feat: detect the render backend at startup`.

- [ ] **Step 3: BLUE** - `clean-code-reviewer` then `refactorer`; close with `refactor: detect-backend clean-code pass`.

---

### Task 6: Engine - the WebGPU renderer factory and barrel (infrastructure)

**Files:** Create `engine/renderer/create-renderer.ts`, `engine/index.ts`, `engine/README.md`.

`create-renderer.ts` is untested GPU glue: it is the one place that constructs a backend renderer, and it is excluded from coverage. It must typecheck.

- [ ] **Step 1: Write `engine/renderer/create-renderer.ts`**

```ts
import type { WebGPURenderer } from 'three/webgpu'

/** Options for constructing the WebGPU scene renderer. */
export interface SceneRendererOptions {
  canvas?: HTMLCanvasElement
  antialias?: boolean
}

/**
 * Creates and initializes the WebGPU renderer. Three.js is imported lazily so the
 * WebGPU build never enters the test or server import graph; this is the one place
 * that constructs a backend renderer. The WebGL2 fallback is a later phase.
 */
export async function createSceneRenderer(
  options: SceneRendererOptions = {},
): Promise<WebGPURenderer> {
  const { WebGPURenderer: Renderer } = await import('three/webgpu')
  const renderer = new Renderer({ canvas: options.canvas, antialias: options.antialias ?? true })
  await renderer.init()
  return renderer
}
```

If `@types/three` types the `WebGPURenderer` constructor parameters such that `canvas`/`antialias` are not assignable, adjust the construction to the actual `WebGPURendererParameters` shape (this file is the only consumer); keep the lazy `import('three/webgpu')` and the `await renderer.init()`.

- [ ] **Step 2: Write `engine/index.ts`**

```ts
export type { SceneRoot } from './scene/build-scene'
export { buildScene } from './scene/build-scene'
export type { LightingProvider } from './lighting/lighting-provider'
export { BasicLightingProvider } from './lighting/basic-lighting-provider'
export type { RenderBackend } from './renderer/detect-backend'
export { detectRenderBackend } from './renderer/detect-backend'
export type { SceneRendererOptions } from './renderer/create-renderer'
export { createSceneRenderer } from './renderer/create-renderer'
```

- [ ] **Step 3: Write `engine/README.md`**

```md
# engine/

Three.js scene management, renderers, and loaders. This is the only layer that imports
`three`. It turns the pure `core/` scene graph into a Three.js object tree (`buildScene`),
supplies lights behind the `LightingProvider` seam, detects the render backend, and owns
the WebGPU renderer factory. Depends only on `core/` and `storage/`. See ADR-0004 and the
design specification, section 6.
```

- [ ] **Step 4: Verify and commit**

Run: `pnpm typecheck && pnpm exec vitest run engine && pnpm lint`
Expected: all pass; engine tests green. Commit:

```
git add engine/renderer/create-renderer.ts engine/index.ts engine/README.md
git commit -m "feat: add the WebGPU renderer factory and engine barrel"
```

---

### Task 7: Bridge - the editor session dispatch boundary

**Files:** Create `bridge/session/editor-session.ts`, `bridge/session/editor-session.test.ts`.

`EditorSession` is the only place outside `core/commands/` that dispatches. It wraps a core `Dispatcher` preconfigured with `registerProjectCommands` and exposes the derived scene graph.

Public surface:

```ts
import type { Command, Project, SceneGraph } from '../../core'

/** The dispatch boundary: the one place outside core/commands that mutates the model. */
export interface EditorSession {
  dispatch(command: Command): void
  undo(): boolean
  redo(): boolean
  getProject(): Project
  getSceneGraph(): SceneGraph
}

export function createEditorSession(project: Project): EditorSession
```

- [ ] **Step 1: RED - dispatch the `test-author`**

Provide the surface, design spec 7.1 and 6.1, and the `core` factory/command signatures the test needs: `createEmptyProject({ name, units, era, appVersion })`, `addFloor(name): Command`. Test at `bridge/session/editor-session.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createEditorSession } from './editor-session'
import { addFloor, createEmptyProject, type Project } from '../../core'

function emptyProject(): Project {
  return createEmptyProject({ name: 'Test', units: 'metric', era: 'modern', appVersion: '0.0.0' })
}

describe('createEditorSession', () => {
  it('dispatches a command and reflects it in the derived scene graph', () => {
    const session = createEditorSession(emptyProject())

    expect(session.getSceneGraph().nodes).toHaveLength(0)
    session.dispatch(addFloor('Ground'))

    expect(session.getSceneGraph().nodes).toHaveLength(1)
    expect(session.getSceneGraph().nodes[0]?.name).toBe('Ground')
    expect(session.getProject().floors).toHaveLength(1)
  })

  it('undoes and redoes dispatched commands through the boundary', () => {
    const session = createEditorSession(emptyProject())
    session.dispatch(addFloor('Ground'))

    expect(session.undo()).toBe(true)
    expect(session.getSceneGraph().nodes).toHaveLength(0)
    expect(session.redo()).toBe(true)
    expect(session.getSceneGraph().nodes).toHaveLength(1)
    expect(session.undo()).toBe(true)
    expect(session.undo()).toBe(false)
  })
})
```

Run: `pnpm exec vitest run bridge/session/editor-session.test.ts`
Expected: FAIL. Commit: `test: cover the editor session dispatch boundary`.

- [ ] **Step 2: GREEN - dispatch the `implementer`**

Provide the surface and the `core` barrel exports it needs (`CommandRegistry`, `Dispatcher`, `registerProjectCommands`, `createSceneGraphDeriver`). Target `bridge/session/editor-session.ts`:

```ts
import {
  CommandRegistry,
  Dispatcher,
  createSceneGraphDeriver,
  registerProjectCommands,
  type Command,
  type Project,
  type SceneGraph,
} from '../../core'

/** The dispatch boundary: the one place outside core/commands that mutates the model. */
export interface EditorSession {
  dispatch(command: Command): void
  undo(): boolean
  redo(): boolean
  getProject(): Project
  getSceneGraph(): SceneGraph
}

export function createEditorSession(project: Project): EditorSession {
  const registry = new CommandRegistry<Project>()
  registerProjectCommands(registry)
  const dispatcher = new Dispatcher<Project>(project, registry)
  const derive = createSceneGraphDeriver()
  return {
    dispatch: (command) => dispatcher.dispatch(command),
    undo: () => dispatcher.undo(),
    redo: () => dispatcher.redo(),
    getProject: () => project,
    getSceneGraph: () => derive(project),
  }
}
```

Run: `pnpm exec vitest run bridge/session/editor-session.test.ts`
Expected: PASS. Commit: `feat: add the editor session dispatch boundary`.

- [ ] **Step 3: BLUE** - `clean-code-reviewer` then `refactorer`; close with `refactor: editor-session clean-code pass`.

---

### Task 8: Bridge - the editor session React context

**Files:** Create `bridge/react/editor-session-context.ts`, `bridge/react/editor-session-provider.tsx`, `bridge/react/editor-session-context.test.tsx`.

The context and hook live in a no-JSX module; the provider component lives in its own file. This split keeps `react-refresh/only-export-components` quiet (no file mixes a component with a non-component runtime export).

Public surface:

```ts
// editor-session-context.ts
export const EditorSessionContext: React.Context<EditorSession | null>
/** Returns the session from the nearest provider; throws if there is none. */
export function useEditorSession(): EditorSession
```

```tsx
// editor-session-provider.tsx
export interface EditorSessionProviderProps {
  session: EditorSession
  children: ReactNode
}
export function EditorSessionProvider(props: EditorSessionProviderProps): JSX.Element
```

- [ ] **Step 1: RED - dispatch the `test-author`**

Provide the surface above and `createEditorSession`/`createEmptyProject` signatures. Test at `bridge/react/editor-session-context.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditorSessionProvider } from './editor-session-provider'
import { useEditorSession } from './editor-session-context'
import { createEditorSession } from '../session/editor-session'
import { createEmptyProject } from '../../core'

function Probe() {
  const session = useEditorSession()
  return <output>{session.getProject().meta.name}</output>
}

describe('useEditorSession', () => {
  it('returns the session provided by EditorSessionProvider', () => {
    const session = createEditorSession(
      createEmptyProject({ name: 'Provided', units: 'metric', era: 'modern', appVersion: '0.0.0' }),
    )

    render(
      <EditorSessionProvider session={session}>
        <Probe />
      </EditorSessionProvider>,
    )

    expect(screen.getByText('Provided')).toBeInTheDocument()
  })

  it('throws when used outside an EditorSessionProvider', () => {
    expect(() => render(<Probe />)).toThrow(/EditorSessionProvider/)
  })
})
```

Run: `pnpm exec vitest run bridge/react/editor-session-context.test.tsx`
Expected: FAIL. Commit: `test: cover the editor session context`.

- [ ] **Step 2: GREEN - dispatch the `implementer`**

Target `bridge/react/editor-session-context.ts`:

```ts
import { createContext, useContext } from 'react'
import type { EditorSession } from '../session/editor-session'

export const EditorSessionContext = createContext<EditorSession | null>(null)

export function useEditorSession(): EditorSession {
  const session = useContext(EditorSessionContext)
  if (session === null) {
    throw new Error('useEditorSession must be used within an EditorSessionProvider')
  }
  return session
}
```

Target `bridge/react/editor-session-provider.tsx`:

```tsx
import type { ReactNode } from 'react'
import type { EditorSession } from '../session/editor-session'
import { EditorSessionContext } from './editor-session-context'

export interface EditorSessionProviderProps {
  session: EditorSession
  children: ReactNode
}

export function EditorSessionProvider({ session, children }: EditorSessionProviderProps) {
  return <EditorSessionContext.Provider value={session}>{children}</EditorSessionContext.Provider>
}
```

Run: `pnpm exec vitest run bridge/react/editor-session-context.test.tsx`
Expected: PASS. Commit: `feat: add the editor session React context`.

- [ ] **Step 3: BLUE** - `clean-code-reviewer` then `refactorer`; close with `refactor: editor-session-context clean-code pass`.

---

### Task 9: Bridge - the WebGPU-gated scene canvas

**Files:** Create `bridge/react/webgpu-scene-view.tsx` (controller glue), `bridge/react/scene-canvas.tsx`, `bridge/react/scene-canvas.test.tsx`, `bridge/index.ts`, `bridge/README.md`.

`webgpu-scene-view.tsx` mounts the R3F `<Canvas>` and is untested glue (excluded from coverage). `SceneCanvas` is the tested behavior: in jsdom it always renders the accessible fallback.

- [ ] **Step 1: Write the untested Canvas glue `bridge/react/webgpu-scene-view.tsx`**

```tsx
import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import { BasicLightingProvider, buildScene, createSceneRenderer } from '../../engine'
import { useEditorSession } from './editor-session-context'

/** Mounts the R3F canvas with the WebGPU renderer. Rendered only when WebGPU is
 *  available, so it never executes under jsdom. */
export function WebGPUSceneView() {
  const session = useEditorSession()
  const root = useMemo(() => {
    const scene = buildScene(session.getSceneGraph())
    new BasicLightingProvider().apply(scene)
    return scene
  }, [session])

  return (
    <Canvas gl={(canvas) => createSceneRenderer({ canvas: canvas as HTMLCanvasElement })}>
      <primitive object={root} />
    </Canvas>
  )
}
```

If R3F 9's `gl` factory parameter or return type does not line up exactly (the `gl` prop accepts a function returning a renderer or a promise of one), adjust this file's `gl` callback to R3F 9's actual `GLProps` signature; keep the async `createSceneRenderer` delegation so renderer construction stays in `engine/`. This file is verified by `pnpm typecheck`, not by a unit test.

- [ ] **Step 2: RED - dispatch the `test-author` for the fallback behavior**

Provide design spec 6.3/6.13 and this surface: `export function SceneCanvas(): JSX.Element` renders an accessible fallback (`role="status"`) when WebGPU is unavailable and the WebGPU canvas otherwise. Test at `bridge/react/scene-canvas.test.tsx` (jsdom has no `navigator.gpu`, so the fallback path is exercised without stubbing):

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SceneCanvas } from './scene-canvas'

describe('SceneCanvas', () => {
  it('renders an accessible fallback when WebGPU is unavailable', () => {
    render(<SceneCanvas />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/webgpu/i)
  })
})
```

Run: `pnpm exec vitest run bridge/react/scene-canvas.test.tsx`
Expected: FAIL. Commit: `test: cover the scene canvas WebGPU fallback`.

- [ ] **Step 3: GREEN - dispatch the `implementer`**

The implementer may read `webgpu-scene-view.tsx` and `engine` (both are implementation source). Target `bridge/react/scene-canvas.tsx`:

```tsx
import { detectRenderBackend } from '../../engine'
import { WebGPUSceneView } from './webgpu-scene-view'

/** The 3D viewport. Renders the WebGPU scene when available, otherwise an
 *  accessible message; the WebGL2 fallback renderer is a later phase. */
export function SceneCanvas() {
  if (detectRenderBackend() !== 'webgpu') {
    return (
      <div role="status" className="scene-canvas__fallback">
        This 3D view requires a WebGPU-capable browser.
      </div>
    )
  }
  return <WebGPUSceneView />
}
```

Run: `pnpm exec vitest run bridge/react/scene-canvas.test.tsx`
Expected: PASS. Commit: `feat: add the WebGPU-gated scene canvas`.

- [ ] **Step 4: BLUE** - `clean-code-reviewer` then `refactorer`; close with `refactor: scene-canvas clean-code pass`.

- [ ] **Step 5: Write the bridge barrel and README (infrastructure)**

`bridge/index.ts`:

```ts
export type { EditorSession } from './session/editor-session'
export { createEditorSession } from './session/editor-session'
export { useEditorSession } from './react/editor-session-context'
export type { EditorSessionProviderProps } from './react/editor-session-provider'
export { EditorSessionProvider } from './react/editor-session-provider'
export { SceneCanvas } from './react/scene-canvas'
```

`bridge/README.md`:

```md
# bridge/

React Three Fiber glue and the command dispatch boundary. `createEditorSession` wraps the
core `Dispatcher` and is the only place outside `core/commands/` that dispatches. The React
context exposes the session to the tree, and `SceneCanvas` mounts the R3F canvas (WebGPU,
with an accessible fallback). This layer imports `@react-three/fiber` and `engine`, never
`three` directly. Depends on `core/`, `storage/`, and `engine/`. See ADR-0019 and the design
specification, sections 6 and 7.1.
```

Run: `pnpm typecheck && pnpm exec vitest run bridge && pnpm lint`
Expected: pass. Commit:

```
git add bridge/index.ts bridge/README.md
git commit -m "feat: add the bridge public barrel"
```

---

### Task 10: Editor - the shell with placeholder panels

**Files:** Create `editor/shell/editor-shell.tsx`, `editor/shell/editor-shell.test.tsx`, `editor/index.ts`, `editor/README.md`.

Public surface: `export function EditorShell(): JSX.Element`. It renders four landmarks: a banner toolbar with the `Vernacular` heading, a `Tools` navigation, a `Viewport` main region hosting `SceneCanvas`, and an `Inspector` complementary region. In jsdom `SceneCanvas` renders its fallback, so the shell needs no session provider to render.

- [ ] **Step 1: RED - dispatch the `test-author`**

Provide the surface, design spec 6.13 (semantic UI and ARIA from day one) and 6.5 (split-pane shell). Test at `editor/shell/editor-shell.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditorShell } from './editor-shell'

describe('EditorShell', () => {
  it('renders labeled toolbar, tools, viewport, and inspector regions', () => {
    render(<EditorShell />)

    expect(screen.getByRole('heading', { level: 1, name: /vernacular/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /tools/i })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: /inspector/i })).toBeInTheDocument()
  })
})
```

Run: `pnpm exec vitest run editor/shell/editor-shell.test.tsx`
Expected: FAIL. Commit: `test: cover the editor shell regions`.

- [ ] **Step 2: GREEN - dispatch the `implementer`**

Target `editor/shell/editor-shell.tsx`:

```tsx
import { SceneCanvas } from '../../bridge'

export function EditorShell() {
  return (
    <div className="editor-shell">
      <header className="editor-shell__toolbar">
        <h1>Vernacular</h1>
      </header>
      <nav className="editor-shell__tools" aria-label="Tools">
        <p>Tools</p>
      </nav>
      <main className="editor-shell__viewport" aria-label="Viewport">
        <SceneCanvas />
      </main>
      <aside className="editor-shell__inspector" aria-label="Inspector">
        <p>Inspector</p>
      </aside>
    </div>
  )
}
```

Run: `pnpm exec vitest run editor/shell/editor-shell.test.tsx`
Expected: PASS. Commit: `feat: add the editor shell with placeholder panels`.

- [ ] **Step 3: BLUE** - `clean-code-reviewer` then `refactorer`; close with `refactor: editor-shell clean-code pass`.

- [ ] **Step 4: Write the editor barrel and README (infrastructure)**

`editor/index.ts`:

```ts
export { EditorShell } from './shell/editor-shell'
```

`editor/README.md`:

```md
# editor/

The React UI: shell, tools, panels, and gizmos. `EditorShell` lays out the toolbar, tool
panel, viewport, and inspector as accessible landmarks and hosts the 3D viewport via
`bridge`'s `SceneCanvas`. Depends on `core/`, `storage/`, `engine/`, and `bridge/`. See the
design specification, sections 6.5 and 6.13.
```

Run: `pnpm lint && pnpm exec vitest run editor`
Expected: pass. Commit:

```
git add editor/index.ts editor/README.md
git commit -m "feat: add the editor public barrel"
```

---

### Task 11: App - the composition root

**Files:** Create `app/app.tsx`, `app/app.test.tsx`, `app/app.stories.tsx`, `app/index.ts`, `app/README.md`. Modify `src/main.tsx`. Delete `src/App.tsx`, `src/App.test.tsx`, `src/App.stories.tsx`.

Public surface: `export function App(): JSX.Element`. It memoizes a session over an empty project and renders the shell inside the provider.

- [ ] **Step 1: RED - dispatch the `test-author`**

Provide the surface and the shell's landmarks. Test at `app/app.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from './app'

describe('App', () => {
  it('composes the editor session and renders the editor shell', () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: /vernacular/i })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()
  })
})
```

Run: `pnpm exec vitest run app/app.test.tsx`
Expected: FAIL. Commit: `test: cover the app composition root`.

- [ ] **Step 2: GREEN - dispatch the `implementer`**

Provide `createEditorSession`/`EditorSessionProvider` (from `bridge`), `EditorShell` (from `editor`), and `createEmptyProject` (from `core`). Target `app/app.tsx`:

```tsx
import { useMemo } from 'react'
import { createEditorSession, EditorSessionProvider } from '../bridge'
import { EditorShell } from '../editor'
import { createEmptyProject } from '../core'

const APP_VERSION = '0.1.0'

export function App() {
  const session = useMemo(
    () =>
      createEditorSession(
        createEmptyProject({
          name: 'Untitled project',
          units: 'imperial',
          era: 'modern',
          appVersion: APP_VERSION,
        }),
      ),
    [],
  )

  return (
    <EditorSessionProvider session={session}>
      <EditorShell />
    </EditorSessionProvider>
  )
}
```

Run: `pnpm exec vitest run app/app.test.tsx`
Expected: PASS. Commit: `feat: add the app composition root`.

- [ ] **Step 3: BLUE** - `clean-code-reviewer` then `refactorer`; close with `refactor: app clean-code pass`.

- [ ] **Step 4: Re-point the entry, relocate the story, remove the old shell (infrastructure)**

Write `app/index.ts`:

```ts
export { App } from './app'
```

Write `app/README.md`:

```md
# app/

The composition root: top-level providers and state. `App` builds an `EditorSession` over an
empty project and renders the `EditorShell` inside the session provider. Depends on `core/`,
`bridge/`, and `editor/`. See the design specification, section 2.1.
```

Write `app/app.stories.tsx` (relocated from `src/`):

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { App } from './app'

const meta: Meta<typeof App> = {
  title: 'App/Shell',
  component: App,
}

export default meta

type Story = StoryObj<typeof App>

export const Default: Story = {}
```

Rewrite `src/main.tsx` to mount the relocated root:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../app'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in index.html')
}
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Delete the old shell files:

```
git rm src/App.tsx src/App.test.tsx src/App.stories.tsx
```

Run: `pnpm typecheck && pnpm lint && pnpm exec vitest run app && pnpm build`
Expected: pass; `tsc` finds no dangling `src/App` import. Commit:

```
git add app/index.ts app/README.md app/app.stories.tsx src/main.tsx
git commit -m "feat: wire the app composition root into the entry point"
```

---

### Task 12: Full-chain verification (infrastructure)

- [ ] **Step 1: Run the complete check chain**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all green. Resolve any failure before proceeding. If `pnpm format:check` flags a generated or edited file, run `pnpm format` and fold the result into the nearest relevant commit (or a `style:` commit if it stands alone).

- [ ] **Step 2: Confirm coverage of the new pure modules**

Run: `pnpm exec vitest run --coverage engine bridge editor app`
Expected: `engine/scene`, `engine/lighting`, `engine/renderer/detect-backend.ts`, `bridge/session`, `bridge/react/editor-session-context.ts`, `bridge/react/editor-session-provider.tsx`, `bridge/react/scene-canvas.tsx`, `editor/shell`, and `app/app.tsx` are covered. The two GPU glue files (`create-renderer.ts`, `webgpu-scene-view.tsx`) are excluded by config and do not appear. (Use `pnpm exec vitest run --coverage`, not `pnpm test -- --coverage`, which does not enable coverage.)

- [ ] **Step 3: Smoke-check the dev entry compiles for the browser**

Run: `pnpm build`
Expected: Vite produces `dist/` with no missing-module or type errors. (A live WebGPU render is verified manually in a capable browser via `pnpm dev`; it is out of scope for automated checks.)

---

### Task 13: Roadmap, knowledge graph, and scratchpad (infrastructure)

- [ ] **Step 1: Mark the source skeleton done in `ROADMAP.md`**

Change the foundation-work row to reflect all six layers landed and set its status to `done`:

```md
| Six-layer source skeleton (core, storage, engine, bridge, editor, app all landed) | done |
```

Run `pnpm exec prettier --write ROADMAP.md` to re-pad the table, then verify `pnpm format:check` passes. Commit: `docs: mark the six-layer source skeleton complete on the roadmap`.

- [ ] **Step 2: Refresh ADR-0004 and author ADR-0019 (local, gitignored)**

Dispatch the `knowledge-curator` subagent (read-only except `docs/knowledge/`). It should:

- Refresh `docs/knowledge/decisions/ADR-0004-three-js-r3f-webgpu.md` (create it if absent) to record the React 19 + React-Three-Fiber 9 + `three/webgpu` `WebGPURenderer` stack, why R3F 9 (and therefore React 19) is required for first-class WebGPU, and that the WebGL2 fallback is a later phase. Cross-link ADR-0001 and ADR-0018.
- Author `docs/knowledge/decisions/ADR-0019-bridge-dispatch-boundary.md`: `createEditorSession` as the single dispatch boundary outside `core/commands/`, the React context seam, the `engine` scene-build seam (`buildScene` + `LightingProvider`), and the WebGPU-gated `SceneCanvas` with an accessible fallback. Cross-link ADR-0005 and ADR-0004.

Then run `pnpm knowledge:index` to regenerate the local index. These files are gitignored; do not stage them. If the curator cannot finish (for example a session limit), author the two ADRs directly in the curator's house style and regenerate the index. This step is off the PR critical path.

- [ ] **Step 3: Update the scratchpad (local, gitignored)**

In `.superpowers/scratch/progress.md`, mark the third plan done with its branch, record that Phase 0f (the six-layer source skeleton) is complete, and note the next milestone is the wall-drawing proof of life. The merge SHA is filled in after Task 14.

---

### Task 14: Finish the branch

- [ ] **Step 1: Final verification before pushing**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all green. Confirm the working tree has only intended changes (`git status --short`) and the commit history shows clean RED -> GREEN -> BLUE triples for the six behaviors plus the infrastructure commits.

- [ ] **Step 2: Push and open the PR**

```
git push -u origin feat/render-and-app-skeleton
gh pr create --base main --title "feat: render and app skeleton" --body "<summary + test plan>"
```

The PR body summarizes the four new layers, the React 19 + R3F 9 + WebGPU decision (link the confirmation), and the empty-scene/fallback behavior; the test plan lists the unit suites plus the manual `pnpm dev` WebGPU check. No `Co-Authored-By` trailer; no em-dashes; no third-party product names.

- [ ] **Step 3: Track CI to green**

Watch the PR checks (Check, Storybook, E2E chromium; Lighthouse may skip). The E2E visual-regression test skips on Linux (no committed Linux baseline); the smoke and accessibility tests must pass against the new shell (the `SceneCanvas` fallback keeps the page axe-clean without a GPU). Fix any failure and push follow-up commits until green.

- [ ] **Step 4: PR review and merge**

Dispatch the `pr-reviewer` subagent for the end-of-branch audit (RGB cycle adherence, Clean Code, CI green). Address any must-fix findings. When the verdict is MERGE and CI is green, merge with the repository's merge-commit strategy to preserve the granular RGB history. Then sync and prune locally:

```
git checkout main && git pull --prune
git branch -d feat/render-and-app-skeleton
```

- [ ] **Step 5: Record the merge SHA**

Fill the merge commit SHA into `.superpowers/scratch/progress.md` (local) and confirm `HEAD == origin/main`. The local darwin visual-regression baseline (`e2e/.../home-chromium-darwin.png`) is now stale; regenerate it with `pnpm exec playwright test visual-regression --update-snapshots` if Playwright browsers are installed locally, otherwise note that it refreshes on the next local E2E run (CI is unaffected because it skips the Linux baseline).

---

## Self-review

**Spec coverage.** Design spec 6.1 (scene graph to renderer): `buildScene` consumes the `core` scene graph (Task 3). 6.3 (Three.js + R3F + WebGPURenderer, backend detection): `createSceneRenderer` + `detectRenderBackend` + R3F 9 `<Canvas>` (Tasks 5, 6, 9). 6.7 (MVP lighting): `BasicLightingProvider` (Task 4). 6.9 (entity id in `userData`): `buildScene` sets `userData.entityId` (Task 3). 6.13 (ARIA from day one): shell landmarks + accessible fallback (Tasks 9, 10). 7.1 (single dispatch boundary, undo/redo): `EditorSession` (Task 7). 2.1 (layer stack): four layers with barrels and boundary-honoring imports (Tasks 6, 9, 10, 11). Phase 0 deliverables "3D renderer skeleton renders an empty scene" and "React app shell with placeholder panels": Tasks 9-11. Out-of-scope items (selection, gizmos, 2D renderer, WebGL2 fallback, autosave) are listed in the scope boundary.

**Placeholder scan.** Every code step carries complete code. The two GPU glue files and the R3F `gl` factory carry a single explicit "adjust to the real type if it differs" instruction because their exact `@types/three`/R3F signatures can only be confirmed against installed packages; they are typecheck-gated, not behavior-gated, and the adjustment is bounded to one callback each.

**Type consistency.** `SceneRoot` is defined in Task 3 and consumed in Task 9. `EditorSession` is defined in Task 7 and consumed in Tasks 8, 9, 11. `detectRenderBackend`/`createSceneRenderer`/`buildScene`/`BasicLightingProvider` are exported by the engine barrel in Task 6 and imported by `bridge` in Task 9. `createEditorSession`/`EditorSessionProvider`/`useEditorSession`/`SceneCanvas` are exported by the bridge barrel in Task 9 and imported by `editor` (Task 10) and `app` (Task 11). `createEmptyProject({ name, units, era, appVersion })` and `addFloor(name)` match the `core` signatures verified against `core/model/factories.ts` and `core/commands/handlers/project-commands.ts`.
</content>
</invoke>
