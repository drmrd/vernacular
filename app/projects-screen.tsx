import { useCallback, useState, type Dispatch, type ReactElement, type SetStateAction } from 'react'
import {
  createNewProject,
  openRecent,
  type FlowResult,
  type SessionPorts,
  type SwitchFailure,
} from '../session'
import { BannerRegion, ThemeProvider, ToastRegion } from '../editor/design-system'
import { ProjectsPage, type OpenProjectLink } from '../editor/projects'
import type { AssetCache } from '../storage'
import { addressFor } from './address'
import { createInitialProject } from './create-initial-project'
import { PageDialog } from './page-dialog'
import { pageNoticeText } from './page-notice-text'
import type { PageNotice, PageScreen } from './resolve-place'
import type { HistoryNavigation } from './use-history-navigation'
import { isSwitchFailure, type Flow, type RunFlow } from './use-open-project'
import { useCardActions } from './use-card-actions'
import { useLibraryPacks, usePageActions } from './use-page-actions'
import { requestedDesignLanguage } from './url-seams'
import { useFailedOpenDialog } from './use-failed-open-dialog'
import { useProjectCards } from './use-project-cards'
import { useTwoFilesDialog } from './use-two-files-dialog'

export interface ProjectsScreenProps {
  readonly navigation: HistoryNavigation
  readonly screen: PageScreen
  readonly ports: SessionPorts | null
  /** The library whose packs supply assets, for an import. */
  readonly libraryAssets?: AssetCache | null
}

/** The id of a page notice that sits under no card. */
const UNDER_NO_CARD = ''

/**
 * The notice of a try from the page. It stands while the screen shows the failure that it replaced
 * or its own failure; a newer failure of the screen replaces it.
 */
interface TriedNotice {
  readonly replacedFailure: SwitchFailure | undefined
  readonly notice: PageNotice | undefined
}

/** The try's state with `notice` set, keeping the failure that the try replaced. */
function withNotice(previous: TriedNotice | null, notice: PageNotice): TriedNotice {
  return { replacedFailure: previous?.replacedFailure, notice }
}

/** The one notice to show: the latest try's while it stands, else the screen's. */
function shownNotice(
  screenNotice: PageNotice | undefined,
  tried: TriedNotice | null,
): PageNotice | undefined {
  if (tried === null) {
    return screenNotice
  }
  const shown = screenNotice?.failure
  const stands = shown === tried.replacedFailure || shown === tried.notice?.failure
  return stands ? tried.notice : screenNotice
}

function hrefFor(id: string): string {
  return addressFor({ kind: 'project', id })
}

function openProjectLink(navigation: HistoryNavigation): OpenProjectLink | undefined {
  const { handle } = navigation
  if (handle === null) {
    return undefined
  }
  return { name: handle.session.getProject().meta.name, onBack: navigation.leavePage }
}

/** What a try from the page needs: the navigation, the screen it starts on, and the cards' reader. */
interface PageTries {
  readonly navigation: HistoryNavigation
  readonly screen: PageScreen
  readonly refresh: () => void
  /** Clears the sentence that a card action left. */
  readonly clearActionNotice: () => void
}

/** The tries of the page actions: the clear of the notice at their start, and their run. */
interface ActionTries {
  readonly onTryStart: () => void
  readonly runActionFlow: RunFlow
}

/**
 * The tries of Import file, a dropped file, and Open folder. A try that the owner ran and that
 * ends with no project reads the cards again. A failure of the switch shows in the page's notice,
 * under no card, and resolves `undefined`, so no toast says it again. Any other result passes on.
 */
function useActionTries(
  { navigation, screen, refresh, clearActionNotice }: PageTries,
  setTried: Dispatch<SetStateAction<TriedNotice | null>>,
): ActionTries {
  const replacedFailure = screen.notice?.failure
  const onTryStart = useCallback(() => {
    setTried({ replacedFailure, notice: undefined })
    clearActionNotice()
  }, [replacedFailure, setTried, clearActionNotice])
  const { runPageFlow } = navigation
  const runActionFlow = useCallback(
    async <Refusal = never,>(flow: Flow<Refusal>): Promise<FlowResult<Refusal> | undefined> => {
      const result = await runPageFlow(flow)
      if (result === undefined || result.ok) {
        return result
      }
      refresh()
      const { failure } = result
      if (!isSwitchFailure(failure)) {
        return result
      }
      // `shownNotice` compares this failure by identity, and `settleFlow` stores it as it is.
      setTried((previous) => withNotice(previous, { id: UNDER_NO_CARD, failure }))
      return undefined
    },
    [runPageFlow, refresh, setTried],
  )
  return { onTryStart, runActionFlow }
}

/** The notice of the page, and the tries of the page that open a project in place of the page. */
function usePageTries(pageTries: PageTries) {
  const { navigation, screen, refresh } = pageTries
  const [tried, setTried] = useState<TriedNotice | null>(null)
  const actionTries = useActionTries(pageTries, setTried)
  const onTryFailed = (id: string, failure: SwitchFailure) => {
    setTried((previous) => withNotice(previous, { id, failure }))
    refresh()
  }
  // The notice clears while the try runs. A try that gives a project leaves the page, and a try
  // that is refused because another runs changed nothing, so only a try that fails sets the notice
  // again and reads the cards again.
  const runTry = (id: string, flow: Flow) => {
    actionTries.onTryStart()
    void navigation.runPageFlow(flow).then((result) => {
      if (result !== undefined && !result.ok) {
        onTryFailed(id, result.failure)
      }
    })
  }
  const openId = navigation.handle?.id
  const onOpen = (id: string) => {
    if (id === openId) {
      navigation.leavePage()
      return
    }
    runTry(id, (ports, current) => openRecent(ports, current, id))
  }
  const newProject: Flow = (ports, current) =>
    createNewProject(ports, current, createInitialProject)
  const onNewProject =
    openId === undefined ? navigation.startFresh : () => runTry(openId, newProject)
  const notice = shownNotice(screen.notice, tried)
  return { notice, onOpen, onNewProject, onTryFailed, ...actionTries }
}

/**
 * The sentence of the last card action that failed. A try of the page clears it, and the start of
 * a card action clears the sentence of a try. The end of an action reads the cards again.
 */
function useActionNotice(refresh: () => void) {
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const clearActionNotice = useCallback(() => setActionNotice(null), [])
  const onActionEnd = useCallback(
    (shown: string | null) => {
      setActionNotice(shown)
      refresh()
    },
    [refresh],
  )
  return { actionNotice, clearActionNotice, onActionEnd }
}

/**
 * The tries, the card actions, and the dialog of the page. A notice under no card stays a sentence
 * of the page; the dialog takes the notice of a card, the start, or an address.
 */
function useScreenParts({ navigation, screen, ports, libraryAssets }: ProjectsScreenProps) {
  const { cards, refresh } = useProjectCards(ports, navigation.handle?.id)
  const { actionNotice, clearActionNotice, onActionEnd } = useActionNotice(refresh)
  const tries = usePageTries({ navigation, screen, refresh, clearActionNotice })
  const { onTryStart, runActionFlow, onOpen, onTryFailed } = tries
  const dialogNotice = tries.notice?.id === UNDER_NO_CARD ? undefined : tries.notice
  const twoFiles = useTwoFilesDialog({
    ...{ ports, navigation, onActionEnd, onTryFailed },
    onActionStart: onTryStart,
    notice: dialogNotice,
  })
  const cardActions = useCardActions({
    ...{ navigation, ports, cards, libraryAssets, onActionEnd },
    onChooseFile: twoFiles.onChooseFile,
    onActionStart: onTryStart,
  })
  const packs = useLibraryPacks(libraryAssets)
  const failedOpen = useFailedOpenDialog({
    ...{ ports, packs, runActionFlow, onOpen, onTryFailed },
    notice: dialogNotice,
    runPageFlow: navigation.runPageFlow,
  })
  const { onRefusedFile, clearFile } = failedOpen
  const actions = usePageActions({
    ...{ runActionFlow, onTryStart, ports, packs },
    onRefusedFile,
    clearFile,
  })
  const pageNotice = failedOpen.takesNotice || twoFiles.takesNotice ? undefined : tries.notice
  const notice = actionNotice ?? pageNoticeText(pageNotice, cards)
  return { cards, tries, cardActions, actions, failedOpen, twoFiles, notice }
}

/**
 * The Projects page in the application: the stored projects, a click that opens each, and the
 * actions that start, import, or open a project.
 */
export function ProjectsScreen(props: ProjectsScreenProps): ReactElement {
  const { cards, tries, cardActions, actions, failedOpen, twoFiles, notice } = useScreenParts(props)
  const openProject = openProjectLink(props.navigation)
  return (
    <ThemeProvider designLanguage={requestedDesignLanguage()}>
      <BannerRegion />
      <ProjectsPage
        cards={cards}
        hrefFor={hrefFor}
        onOpen={tries.onOpen}
        onNewProject={tries.onNewProject}
        cardActions={cardActions}
        {...actions}
        {...(openProject === undefined ? {} : { openProject })}
        {...(notice === undefined ? {} : { notice })}
      />
      <PageDialog
        failedOpen={failedOpen}
        twoFiles={twoFiles.dialog}
        onOpen={tries.onOpen}
        onExport={cardActions.onExport}
      />
      <ToastRegion />
    </ThemeProvider>
  )
}
