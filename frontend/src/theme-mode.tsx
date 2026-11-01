import { storagePrefix } from './config'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material'
import { buildTheme, type ThemeMode } from './theme'
import { ThemeModeContext } from './theme-mode-context'

const STORAGE_KEY = `${storagePrefix}:theme`

export const ThemeModeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
    return 'system'
  })

  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')
  const resolvedMode: 'light' | 'dark' = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode

  const theme = useMemo(() => buildTheme(resolvedMode), [resolvedMode])

  const setMode = (next: ThemeMode) => {
    setModeState(next)
    localStorage.setItem(STORAGE_KEY, next)
  }

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedMode
  }, [resolvedMode])

  const value = useMemo(
    () => ({
      mode,
      resolvedMode,
      setMode,
    }),
    [mode, resolvedMode],
  )

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  )
}
