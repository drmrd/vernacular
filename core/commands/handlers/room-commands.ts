import type { Point, Project, RoomOverride } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const SET_ROOM_NAME = 'room/set-name'

export interface SetRoomNameParams {
  roomKey: string
  name: string
}

export function setRoomName(roomKey: string, name: string): Command<SetRoomNameParams> {
  return {
    type: SET_ROOM_NAME,
    params: { roomKey, name },
    description: 'Name room',
  }
}

export const SET_ROOM_CUSTOM_POLYGON = 'room/set-custom-polygon'

export interface SetRoomCustomPolygonParams {
  roomKey: string
  polygon: Point[]
}

export function setRoomCustomPolygon(
  roomKey: string,
  polygon: Point[],
): Command<SetRoomCustomPolygonParams> {
  return {
    type: SET_ROOM_CUSTOM_POLYGON,
    params: { roomKey, polygon },
    description: 'Set room outline',
  }
}

// Reassigns the whole roomOverrides slice to a new map with a new override
// object for the target key, merging the patch over any existing entry so the
// entry's other fields survive. Reassigning the root-level slice lets the
// inverse-capture proxy record only the root's top-level change so undo
// restores the prior reference (including back to an absent map).
function mergeRoomOverride(state: Project, roomKey: string, patch: Partial<RoomOverride>): void {
  state.roomOverrides = {
    ...state.roomOverrides,
    [roomKey]: {
      ...state.roomOverrides?.[roomKey],
      ...patch,
    },
  }
}

const setRoomNameHandler: CommandHandler<Project, SetRoomNameParams> = {
  apply(state, params) {
    mergeRoomOverride(state, params.roomKey, { name: params.name })
  },
}

const setRoomCustomPolygonHandler: CommandHandler<Project, SetRoomCustomPolygonParams> = {
  apply(state, params) {
    mergeRoomOverride(state, params.roomKey, { customPolygon: params.polygon })
  },
}

export function registerRoomCommands(registry: CommandRegistry<Project>): CommandRegistry<Project> {
  return registry
    .register(SET_ROOM_NAME, setRoomNameHandler)
    .register(SET_ROOM_CUSTOM_POLYGON, setRoomCustomPolygonHandler)
}
