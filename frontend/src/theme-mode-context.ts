import { createContext } from 'react'
import type { ThemeMode } from './theme'

type ThemeModeContextValue = {
  mode: ThemeMode
  resolvedMode: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
}

const ThemeModeContext = createContext<ThemeModeContextValue | undefined>(undefined)

export type { ThemeModeContextValue }
export { ThemeModeContext }
