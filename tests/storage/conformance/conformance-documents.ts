import {
  CURRENT_SCHEMA_VERSION,
  CommandRegistry,
  Dispatcher,
  encodeDocument,
  registerAllProjectCommands,
  setProjectStyle,
} from '../../../core'
import type { DecodedDocument, Project } from '../../../core'
import type { SecondFileState, TwoDocumentFiles } from '../../../storage'
import type { DocumentStore, StoreRead } from '../../../storage/documents/document-store'
import { versionFixtureBytes } from '../../fixtures/projects/versions'
import {
  atHigherRevision,
  bytesOf,
  firstWallOf,
  fixtureDocument,
  metaOf,
  projectOf,
  withUnknownWallField,
} from '../../fixtures/projects/versions/fixture-documents'
import type { Json } from '../../fixtures/projects/versions/fixture-documents'
import { PROJECT_ID } from './conformance-run'

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

/** The document of the current version, stored as a build with the next schema version writes it. */
export function documentOfNewerVersion(): Uint8Array {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  metaOf(document).schemaVersion = CURRENT_SCHEMA_VERSION + 1
  return bytesOf(document)
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

/** What a read says about the second file; undefined when the read has no word on it. */
export function secondFileOf(read: StoreRead): SecondFileState | undefined {
  return 'secondFile' in read ? read.secondFile : undefined
}

/** Why a read failed; throws when the read succeeded. */
export function failureOf(read: StoreRead): Exclude<StoreRead, { ok: true }>['failure'] {
  if (read.ok) throw new Error('Expected the read to fail')
  return read.failure
}

/** Bytes that are not JSON, so that no decode of them succeeds. */
export const NOT_JSON = new TextEncoder().encode('{ not json')

/** The name of the project in the document that `soundSecondFile` gives by default. */
export const SECOND_FILE_PROJECT_NAME = 'Saved beside the newer file'

/** A sound document of the current version that is told apart from the fixture by its name. */
export function soundSecondFile(name = SECOND_FILE_PROJECT_NAME): Uint8Array {
  return encodeDocument(renamed(soundProject(), name), undefined).bytes
}

/** The two document files of the project `id`; throws when it does not have two. */
export async function twoFilesOrThrow(
  store: DocumentStore,
  id: string = PROJECT_ID,
): Promise<TwoDocumentFiles> {
  const files = await store.twoFiles(id)
  if (files === undefined) throw new Error('Expected the project to have two document files')
  return files
}
