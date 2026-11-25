import { toPlaybook, useEditor } from '../store/editorStore'
import { parsePlaybook } from './playbookFile'
import type { PlaybookStorage } from './playbookStorage'

export type Persistence = {
  /** Saves now, if anything is waiting. Call when the page is being hidden or closed. */
  flush(): Promise<void>
  stop(): void
}

/**
 * Loads the saved playbook into the editor, then saves every change shortly after it happens.
 * There is no save button: what is on screen is what is stored.
 */
export async function startPersistence(storage: PlaybookStorage, delayMs = 400): Promise<Persistence> {
  let saved: unknown = null
  try {
    saved = await storage.load()
  } catch (error) {
    console.warn('Could not read the saved playbook.', error)
    useEditor.setState({ saveStatus: 'error' })
  }

  if (saved) {
    try {
      useEditor.getState().loadPlaybook(parsePlaybook(saved))
    } catch (error) {
      // Never overwrite something we could not read. Set it aside and start fresh.
      console.warn('The saved playbook could not be read and was set aside.', error)
      await storage.quarantine(saved).catch(() => {})
    }
  }
  useEditor.setState({ hydrated: true })

  let timer: ReturnType<typeof setTimeout> | undefined
  let dirty = false

  const save = async () => {
    clearTimeout(timer)
    timer = undefined
    if (!dirty) return
    dirty = false
    try {
      await storage.save(toPlaybook(useEditor.getState()))
      if (!dirty) useEditor.setState({ saveStatus: 'saved' })
    } catch (error) {
      console.warn('Could not save the playbook.', error)
      dirty = true
      useEditor.setState({ saveStatus: 'error' })
    }
  }

  const unsubscribe = useEditor.subscribe((state, previous) => {
    const changed =
      state.plays !== previous.plays ||
      state.rules !== previous.rules ||
      state.wristCoach !== previous.wristCoach ||
      state.playbookName !== previous.playbookName ||
      state.playbookId !== previous.playbookId
    if (!changed) return
    dirty = true
    if (state.saveStatus !== 'saving') useEditor.setState({ saveStatus: 'saving' })
    clearTimeout(timer)
    timer = setTimeout(save, delayMs)
  })

  return {
    flush: save,
    stop() {
      clearTimeout(timer)
      unsubscribe()
    },
  }
}
