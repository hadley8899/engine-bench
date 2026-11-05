import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { ThemeModeProvider } from './theme-mode'
import { ToastProvider } from './components/ToastProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeModeProvider>
      {/* Navigate at once: as transitions, page changes wait behind the
          bench's frequent telemetry updates while an engine runs. */}
      <BrowserRouter useTransitions={false}>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeModeProvider>
  </StrictMode>,
)
