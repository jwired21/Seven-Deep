import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { useApp } from './app/appStore'
import './index.css'
import { startPersistence } from './storage/persistence'
import { indexedDbStorage, memoryStorage, type PlaybookStorage } from './storage/playbookStorage'
import { useEditor } from './store/editorStore'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/** Loads the saved playbook, then keeps it saved. Falls back to memory if the browser blocks storage. */
async function persist() {
  let storage: PlaybookStorage
  let blocked = false
  try {
    storage = indexedDbStorage()
    await storage.load()
  } catch (error) {
    console.warn('Browser storage is not available. Plays will not be kept after this tab closes.', error)
    storage = memoryStorage()
    blocked = true
  }

  const persistence = await startPersistence(storage)
  if (blocked) useEditor.setState({ saveStatus: 'error' })

  // Save right away when the tab is hidden or closed, without waiting for the usual short delay.
  window.addEventListener('pagehide', () => void persistence.flush())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void persistence.flush()
  })

  // Ask the browser not to clear this site's data when the device runs low on space.
  void navigator.storage?.persist?.().catch(() => {})
}

void persist()

// The service worker saves the whole app on the device, so it opens with no signal.
// It is only built for production, so the dev server always serves fresh code.
if (import.meta.env.PROD) {
  registerSW({
    immediate: true,
    onOfflineReady: () => useApp.setState({ offlineReady: true }),
  })
  // On every visit after the first, the page is already being served from the device.
  if (navigator.serviceWorker?.controller) useApp.setState({ offlineReady: true })
}
