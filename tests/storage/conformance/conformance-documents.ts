import {
  CURRENT_SCHEMA_VERSION,
  CommandRegistry,
  Dispatcher,
  encodeDocument,
  registerAllProjectCommands,
  setProjectStyle,
} from '../../../core'
import type { DecodedDocument, Project } from '../../../core'
import type { StoreRead } from '../../../storage/documents/document-store'
import { versionFixtureBytes } from '../../fixtures/projects/versions'
import {
  atHigherRevision,
  bytesOf,
  firstWallOf,
  fixtureDocument,
  projectOf,
  withUnknownWallField,
} from '../../fixtures/projects/versions/fixture-documents'
import type { Json } from '../../fixtures/projects/versions/fixture-documents'

/** The document of the current schema version, as the application writes it. */
export function currentBytes(): Uint8Array {
  return versionFixtureBytes(CURRENT_SCHEMA_VERSION)
}

/** A project of the current schema version that breaks no format rule. */
export function soundProject(): Project {
  return projectOf(currentBytes())
}

/** The same project under another name, so that a save of it changes the stored bytes. */
export function renamed(project: Project, name: string): Project {
  return { ...project, meta: { ...project.meta, name } }
}

/** A project that breaks the format rules: an unknown field on its first wall. */
export function faultyProject(): Project {
  const project = soundProject()
  withUnknownWallField(project as unknown as Json)
  return project
}

/** The document of the current version with an unknown wall field, at the revision of this build. */
export function documentBreakingFormatRules(): Uint8Array {
  return bytesOf(withUnknownWallField(fixtureDocument(CURRENT_SCHEMA_VERSION)))
}

/** The document of the current version with an unknown wall field, as a higher revision wrote it. */
export function documentOfHigherRevision(): Uint8Array {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  return bytesOf(atHigherRevision(withUnknownWallField(document)))
}

/** An `extensions` payload that no build knows the meaning of. */
const EXTENSIONS_NAMESPACE = 'org.example.probe'
export const EXTENSIONS_PAYLOAD = { [EXTENSIONS_NAMESPACE]: { tags: ['kept'] } }

/** The document of the current version with the payload on the root and on its first wall. */
export function documentWithExtensions(): Uint8Array {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  document.extensions = structuredClone(EXTENSIONS_PAYLOAD)
  firstWallOf(document).extensions = structuredClone(EXTENSIONS_PAYLOAD)
  return bytesOf(document)
}

const STYLE = { styleId: 'italianate' }

function dispatcherFor(project: Project): Dispatcher<Project> {
  return new Dispatcher(project, registerAllProjectCommands(new CommandRegistry<Project>()))
}

/** The document of the current version in which the optional project style is set. */
export function documentWithProjectStyle(): Uint8Array {
  const project = soundProject()
  dispatcherFor(project).dispatch(setProjectStyle(STYLE))
  return encodeDocument(project, undefined).bytes
}

/** The project with its optional style cleared, as the command of the editor clears it. */
export function withProjectStyleCleared(project: Project): Project {
  dispatcherFor(project).dispatch(setProjectStyle(undefined))
  return project
}

/** The decoded document of a read that succeeded; throws, naming the failure, otherwise. */
export function decodedOf(read: StoreRead): DecodedDocument {
  if (!read.ok) throw new Error(`Expected the read to succeed: ${JSON.stringify(read.failure)}`)
  return read.value
}

/** Why a read failed; throws when the read succeeded. */
export function failureOf(read: StoreRead): Exclude<StoreRead, { ok: true }>['failure'] {
  if (read.ok) throw new Error('Expected the read to fail')
  return read.failure
}
