import type { Point, Project } from '../../model/types'
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
// object for the target key, preserving any existing customPolygon, so the
// inverse-capture proxy records only the root's top-level change and undo
// restores the prior reference (including back to an absent map).
const setRoomNameHandler: CommandHandler<Project, SetRoomNameParams> = {
  apply(state, params) {
    state.roomOverrides = {
      ...state.roomOverrides,
      [params.roomKey]: {
        ...state.roomOverrides?.[params.roomKey],
        name: params.name,
      },
    }
  },
}

// Reassigns the whole roomOverrides slice to a new map with a new override
// object for the target key, preserving any existing name, so the
// inverse-capture proxy records only the root's top-level change and undo
// restores the prior reference (including back to an absent map).
const setRoomCustomPolygonHandler: CommandHandler<Project, SetRoomCustomPolygonParams> = {
  apply(state, params) {
    state.roomOverrides = {
      ...state.roomOverrides,
      [params.roomKey]: {
        ...state.roomOverrides?.[params.roomKey],
        customPolygon: params.polygon,
      },
    }
  },
}

export function registerRoomCommands(registry: CommandRegistry<Project>): CommandRegistry<Project> {
  return registry
    .register(SET_ROOM_NAME, setRoomNameHandler)
    .register(SET_ROOM_CUSTOM_POLYGON, setRoomCustomPolygonHandler)
}
