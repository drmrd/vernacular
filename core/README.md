# core/

The pure-TypeScript domain layer. No React, no Three.js, no DOM. Everything here is
testable in plain Node. Other layers depend on `core/`; `core/` depends on nothing
above it. See ADR-0001 and the design specification, section 2.
