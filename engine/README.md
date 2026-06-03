# engine/

Three.js scene management, renderers, and loaders. This is the only layer that imports
`three`. It turns the pure `core/` scene graph into a Three.js object tree (`buildScene`),
supplies lights behind the `LightingProvider` seam, detects the render backend, and owns
the WebGPU renderer factory. Depends only on `core/` and `storage/`. See ADR-0004 and the
design specification, section 6.
