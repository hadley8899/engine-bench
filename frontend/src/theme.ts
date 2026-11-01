import { createTheme } from '@mui/material/styles'

export type ThemeMode = 'light' | 'dark' | 'system'

export const buildTheme = (mode: 'light' | 'dark') =>
  createTheme({
    palette: {
      mode,
      primary: {
        main: mode === 'dark' ? '#5aa7d8' : '#1f3b4d',
      },
      secondary: {
        main: mode === 'dark' ? '#f29b38' : '#e07b3c',
      },
      background: {
        default: mode === 'dark' ? '#0d1117' : '#f0f2f5',
        paper: mode === 'dark' ? '#151b23' : '#ffffff',
      },
      text: {
        primary: mode === 'dark' ? '#e6edf3' : '#1b232b',
        secondary: mode === 'dark' ? '#9aa4af' : '#55616d',
      },
      divider: mode === 'dark' ? 'rgba(230, 237, 243, 0.1)' : 'rgba(27, 35, 43, 0.12)',
    },
    shape: {
      borderRadius: 18,
    },
    typography: {
      fontFamily: '"Saira", "Helvetica Neue", sans-serif',
      h1: { fontFamily: '"Saira Condensed", "Saira", sans-serif', fontWeight: 600 },
      h2: { fontFamily: '"Saira Condensed", "Saira", sans-serif', fontWeight: 600 },
      h3: { fontFamily: '"Saira Condensed", "Saira", sans-serif', fontWeight: 600 },
      h4: { fontFamily: '"Saira Condensed", "Saira", sans-serif', fontWeight: 600 },
      h5: { fontFamily: '"Saira Condensed", "Saira", sans-serif', fontWeight: 600 },
      h6: { fontFamily: '"Saira Condensed", "Saira", sans-serif', fontWeight: 600 },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 999,
            fontWeight: 600,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            borderRadius: 0,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 24,
            border:
              mode === 'dark' ? '1px solid rgba(231, 237, 242, 0.08)' : '1px solid rgba(28, 46, 42, 0.08)',
            boxShadow:
              mode === 'dark'
                ? '0 28px 60px rgba(0, 0, 0, 0.55)'
                : '0 24px 60px rgba(20, 30, 25, 0.14)',
          },
        },
      },
    },
  })
