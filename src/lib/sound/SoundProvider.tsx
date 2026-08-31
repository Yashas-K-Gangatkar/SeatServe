'use client'

/**
 * NotiFetch — sound preference context.
 *
 * Contract (from the motion brief):
 *  - default OFF, remembered per browser (localStorage)
 *  - the AudioContext is only created inside a user gesture
 *  - `play()` is safe to call from anywhere; it no-ops while disabled,
 *    before unlock, on mobile lock-screen states, or on any failure
 *
 * The preference is read through useSyncExternalStore so server HTML and
 * hydrated render always agree (no mismatch), and storage events keep
 * multiple tabs in sync.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'
import type { ReactNode } from 'react'
import { sound } from './SoundManager'
import type { SoundName } from '@/lib/motion/config'

const STORAGE_KEY = 'notifetch.sound'
const CHANGE_EVENT = 'notifetch:sound-change'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

function getSnapshot(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

function getServerSnapshot(): boolean {
  return false
}

interface SoundApi {
  enabled: boolean
  toggle: () => void
  /** Fire a cue at a meaningful event. No-op unless the user enabled sound. */
  play: (name: SoundName, volumeScale?: number) => void
}

const SoundCtx = createContext<SoundApi>({
  enabled: false,
  toggle: () => undefined,
  play: () => undefined,
})

export function SoundProvider({ children }: { children: ReactNode }) {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const unlocked = useRef(false)

  // Returning visitors with sound ON: pre-arm the context. Browsers keep it
  // suspended until a gesture, so also resume on the first pointer press.
  useEffect(() => {
    if (!enabled || unlocked.current) return
    unlocked.current = true
    sound.unlock()
    const arm = () => sound.unlock()
    window.addEventListener('pointerdown', arm, { once: true })
    return () => window.removeEventListener('pointerdown', arm)
  }, [enabled])

  useEffect(() => {
    return () => sound.dispose()
  }, [])

  const toggle = useCallback(() => {
    const next = !getSnapshot()
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
    } catch {
      /* noop */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
    if (next) {
      // inside the click gesture — the only place we may unlock audio
      unlocked.current = true
      sound.unlock()
      sound.unduck()
      // confirm in the exact gesture that enabled it
      sound.play('toggle')
    } else {
      sound.duck()
    }
  }, [])

  const play = useCallback(
    (name: SoundName, volumeScale = 1) => {
      if (!enabled || !unlocked.current) return
      sound.play(name, volumeScale)
    },
    [enabled],
  )

  const api = useMemo<SoundApi>(
    () => ({ enabled, toggle, play }),
    [enabled, toggle, play],
  )

  return <SoundCtx.Provider value={api}>{children}</SoundCtx.Provider>
}

export function useSound(): SoundApi {
  return useContext(SoundCtx)
}
