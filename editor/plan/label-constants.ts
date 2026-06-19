/**
 * The pixel size of the canvas label face, matching the `12px sans-serif` font
 * the draw path sets. Shared by the placement decision (`room-label.ts`) and the
 * de-confliction layout (`label-layout.ts`) so both agree with the painted text
 * without `editor/plan/draw-plan.ts` leaking into either pure module.
 */
export const LABEL_FONT_SIZE_PX = 12

/**
 * Vertical pixel gap between the name line and the area line, matching the draw
 * path's `LABEL_LINE_HEIGHT` so a name+area block's projected height matches what
 * is painted. Shared so the placement and layout passes size the block alike.
 */
export const LABEL_LINE_HEIGHT_PX = 14
