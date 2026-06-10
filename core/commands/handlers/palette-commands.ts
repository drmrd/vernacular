import type { NamedColor } from '../../color/color'
import type { Project, ProjectPalette } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const CREATE_PROJECT_PALETTE = 'palette/create'

export interface CreateProjectPaletteParams {
  palette: ProjectPalette
}

export function createProjectPalette(init: {
  id: string
  name: string
  description?: string
}): Command<CreateProjectPaletteParams> {
  const palette: ProjectPalette = {
    id: init.id,
    name: init.name,
    colors: [],
    ...(init.description !== undefined ? { description: init.description } : {}),
  }
  return { type: CREATE_PROJECT_PALETTE, params: { palette }, description: 'Create palette' }
}

const createProjectPaletteHandler: CommandHandler<Project, CreateProjectPaletteParams> = {
  apply(state, params) {
    // Reassign the whole palettes slice so the inverse-capture proxy records the
    // root-level change and undo restores the prior reference (including back to
    // an absent array).
    state.palettes = [...(state.palettes ?? []), params.palette]
  },
}

export const REMOVE_PROJECT_PALETTE = 'palette/remove'

export interface RemoveProjectPaletteParams {
  paletteId: string
}

export function removeProjectPalette(paletteId: string): Command<RemoveProjectPaletteParams> {
  return { type: REMOVE_PROJECT_PALETTE, params: { paletteId }, description: 'Remove palette' }
}

const removeProjectPaletteHandler: CommandHandler<Project, RemoveProjectPaletteParams> = {
  apply(state, params) {
    state.palettes = (state.palettes ?? []).filter((palette) => palette.id !== params.paletteId)
  },
}

export const RENAME_PROJECT_PALETTE = 'palette/rename'

export interface RenameProjectPaletteParams {
  paletteId: string
  name: string
}

export function renameProjectPalette(
  paletteId: string,
  name: string,
): Command<RenameProjectPaletteParams> {
  return {
    type: RENAME_PROJECT_PALETTE,
    params: { paletteId, name },
    description: 'Rename palette',
  }
}

const renameProjectPaletteHandler: CommandHandler<Project, RenameProjectPaletteParams> = {
  apply(state, params) {
    state.palettes = (state.palettes ?? []).map((palette) =>
      palette.id === params.paletteId ? { ...palette, name: params.name } : palette,
    )
  },
}

export const ADD_PALETTE_COLOR = 'palette/add-color'

export interface AddPaletteColorParams {
  paletteId: string
  color: NamedColor
}

export function addPaletteColor(
  paletteId: string,
  color: NamedColor,
): Command<AddPaletteColorParams> {
  return { type: ADD_PALETTE_COLOR, params: { paletteId, color }, description: 'Add palette color' }
}

const addPaletteColorHandler: CommandHandler<Project, AddPaletteColorParams> = {
  apply(state, params) {
    state.palettes = (state.palettes ?? []).map((palette) =>
      palette.id === params.paletteId
        ? { ...palette, colors: [...palette.colors, params.color] }
        : palette,
    )
  },
}

export const REMOVE_PALETTE_COLOR = 'palette/remove-color'

export interface RemovePaletteColorParams {
  paletteId: string
  index: number
}

export function removePaletteColor(
  paletteId: string,
  index: number,
): Command<RemovePaletteColorParams> {
  return {
    type: REMOVE_PALETTE_COLOR,
    params: { paletteId, index },
    description: 'Remove palette color',
  }
}

const removePaletteColorHandler: CommandHandler<Project, RemovePaletteColorParams> = {
  apply(state, params) {
    state.palettes = (state.palettes ?? []).map((palette) => {
      if (palette.id !== params.paletteId) {
        return palette
      }
      const colors = [...palette.colors]
      colors.splice(params.index, 1)
      return { ...palette, colors }
    })
  },
}

export function registerPaletteCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  return registry
    .register(CREATE_PROJECT_PALETTE, createProjectPaletteHandler)
    .register(REMOVE_PROJECT_PALETTE, removeProjectPaletteHandler)
    .register(RENAME_PROJECT_PALETTE, renameProjectPaletteHandler)
    .register(ADD_PALETTE_COLOR, addPaletteColorHandler)
    .register(REMOVE_PALETTE_COLOR, removePaletteColorHandler)
}
