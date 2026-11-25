import { create } from 'zustand'

/** Below this width the layout stacks, and the app opens in view mode. Matches the CSS breakpoint. */
export const PHONE_WIDTH = 820

export type AppState = {
  /** True in the full-screen view mode for flipping through plays. False in the editor. */
  viewing: boolean
  /** True once everything is saved on the device, so the app opens with no signal. */
  offlineReady: boolean
  setViewing(viewing: boolean): void
}

const onPhone = () => typeof window !== 'undefined' && window.matchMedia?.(`(max-width: ${PHONE_WIDTH}px)`).matches === true

/** App-level state that is not part of the playbook: which mode is showing, and offline status. */
export const useApp = create<AppState>()((set) => ({
  // On a phone the app is mostly for looking plays up at the field, so it opens in view mode.
  viewing: onPhone(),
  offlineReady: false,
  setViewing: (viewing) => set({ viewing }),
}))
