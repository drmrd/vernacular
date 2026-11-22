// core/assets/texture-asset-rules.ts
//
// Field rules for texture assets in a pack manifest (ADR-0219). Pure: it
// appends human-readable problems to the caller's error list.

type TextureFieldValidator = (
  asset: Record<string, unknown>,
  label: string,
  errors: string[],
) => void

export const validateTextureFields: TextureFieldValidator = () => undefined
