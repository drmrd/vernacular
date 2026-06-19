import type {
  PeriodId,
  Point,
  Project,
  RoomOverride,
  RoomPurposeId,
  StyleTag,
} from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'
import { assertPositiveLength } from '../../units/length-bounds'

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

// Each field may be explicitly set to `undefined` to clear it (falling back to
// the next level of the resolution hierarchy), so the patch type widens each
// optional field to allow `undefined` under `exactOptionalPropertyTypes`.
type RoomOverridePatch = { [Field in keyof RoomOverride]?: RoomOverride[Field] | undefined }

// Reassigns the whole roomOverrides slice to a new map with a new override
// object for the target key, merging the patch over any existing entry so the
// entry's other fields survive. Reassigning the root-level slice lets the
// inverse-capture proxy record only the root's top-level change so undo
// restores the prior reference (including back to an absent map). A field set to
// `undefined` in the patch clears that field, which is structurally equivalent
// to its absence, so the merged entry is a valid RoomOverride.
function mergeRoomOverride(state: Project, roomKey: string, patch: RoomOverridePatch): void {
  const merged: RoomOverridePatch = {
    ...state.roomOverrides?.[roomKey],
    ...patch,
  }
  state.roomOverrides = {
    ...state.roomOverrides,
    [roomKey]: merged as RoomOverride,
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

export const SET_ROOM_PURPOSE = 'room/set-purpose'

export interface SetRoomPurposeParams {
  roomKey: string
  purpose: RoomPurposeId | undefined
}

export function setRoomPurpose(
  roomKey: string,
  purpose: RoomPurposeId | undefined,
): Command<SetRoomPurposeParams> {
  return { type: SET_ROOM_PURPOSE, params: { roomKey, purpose }, description: 'Set room purpose' }
}

const setRoomPurposeHandler: CommandHandler<Project, SetRoomPurposeParams> = {
  apply(state, params) {
    mergeRoomOverride(state, params.roomKey, { purpose: params.purpose })
  },
}

export const SET_ROOM_SUB_PURPOSE = 'room/set-sub-purpose'

export interface SetRoomSubPurposeParams {
  roomKey: string
  subPurpose: string | undefined
}

export function setRoomSubPurpose(
  roomKey: string,
  subPurpose: string | undefined,
): Command<SetRoomSubPurposeParams> {
  return {
    type: SET_ROOM_SUB_PURPOSE,
    params: { roomKey, subPurpose },
    description: 'Set room sub-purpose',
  }
}

const setRoomSubPurposeHandler: CommandHandler<Project, SetRoomSubPurposeParams> = {
  apply(state, params) {
    mergeRoomOverride(state, params.roomKey, { subPurpose: params.subPurpose })
  },
}

export const SET_ROOM_PERIOD = 'room/set-period'

export interface SetRoomPeriodParams {
  roomKey: string
  period: PeriodId | undefined
}

export function setRoomPeriod(
  roomKey: string,
  period: PeriodId | undefined,
): Command<SetRoomPeriodParams> {
  return { type: SET_ROOM_PERIOD, params: { roomKey, period }, description: 'Set room period' }
}

const setRoomPeriodHandler: CommandHandler<Project, SetRoomPeriodParams> = {
  apply(state, params) {
    mergeRoomOverride(state, params.roomKey, { periodOverride: params.period })
  },
}

export const SET_ROOM_STYLE = 'room/set-style'

export interface SetRoomStyleParams {
  roomKey: string
  style: StyleTag | undefined
}

export function setRoomStyle(
  roomKey: string,
  style: StyleTag | undefined,
): Command<SetRoomStyleParams> {
  return { type: SET_ROOM_STYLE, params: { roomKey, style }, description: 'Set room style' }
}

const setRoomStyleHandler: CommandHandler<Project, SetRoomStyleParams> = {
  apply(state, params) {
    mergeRoomOverride(state, params.roomKey, { styleOverride: params.style })
  },
}

export const SET_ROOM_CEILING_HEIGHT = 'room/set-ceiling-height'

export interface SetRoomCeilingHeightParams {
  roomKey: string
  height: number | undefined
}

export function setRoomCeilingHeight(
  roomKey: string,
  height: number | undefined,
): Command<SetRoomCeilingHeightParams> {
  return {
    type: SET_ROOM_CEILING_HEIGHT,
    params: { roomKey, height },
    description: 'Set room ceiling height',
  }
}

const setRoomCeilingHeightHandler: CommandHandler<Project, SetRoomCeilingHeightParams> = {
  apply(state, params) {
    if (params.height !== undefined) {
      assertPositiveLength(params.height, 'Ceiling height')
    }
    mergeRoomOverride(state, params.roomKey, { ceilingHeight: params.height })
  },
}

export function registerRoomCommands(registry: CommandRegistry<Project>): CommandRegistry<Project> {
  return registry
    .register(SET_ROOM_NAME, setRoomNameHandler)
    .register(SET_ROOM_CUSTOM_POLYGON, setRoomCustomPolygonHandler)
    .register(SET_ROOM_PURPOSE, setRoomPurposeHandler)
    .register(SET_ROOM_SUB_PURPOSE, setRoomSubPurposeHandler)
    .register(SET_ROOM_PERIOD, setRoomPeriodHandler)
    .register(SET_ROOM_STYLE, setRoomStyleHandler)
    .register(SET_ROOM_CEILING_HEIGHT, setRoomCeilingHeightHandler)
}
