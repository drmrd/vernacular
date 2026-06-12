// The stable, cross-track slot-id contract. Sibling tracks mount panels into the
// frame by importing the matching constant and rendering a PanelSlot with that id;
// they never edit the shell layout. Renaming an id is a deliberate, reviewed change
// because shell-panel-slots.test.ts pins these values.

export const FLOOR_SWITCHER_SLOT = 'floor-switcher'
export const PAINT_PICKER_SLOT = 'paint-pickers'
export const PAINT_INSPECTOR_SLOT = 'paint-inspector'
export const SNAP_PANEL_SLOT = 'snap-panel'

export const SHELL_PANEL_SLOTS = [
  FLOOR_SWITCHER_SLOT,
  PAINT_PICKER_SLOT,
  PAINT_INSPECTOR_SLOT,
  SNAP_PANEL_SLOT,
] as const
