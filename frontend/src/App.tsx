import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { Box, CircularProgress } from '@mui/material'
import { useAuth } from './auth/useAuth'
import { LoginPage } from './pages/auth/LoginPage.tsx'
import { RegisterPage } from './pages/auth/RegisterPage.tsx'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage.tsx'
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage.tsx'
import { BenchErrorBoundary } from './bench/BenchErrorBoundary'
import { BenchPage } from './bench/BenchPage'
import { DashboardPage } from './pages/DashboardPage'
import { CompanySetupPage } from './pages/auth/CompanySetupPage.tsx'
import { AppShell } from './components/AppShell'
import { SettingsHomePage } from './pages/settings/SettingsHomePage'
import { UserManagementSettingsPage } from './pages/settings/UserManagementSettingsPage'
import { ActiveSessionsSettingsPage } from './pages/settings/ActiveSessionsSettingsPage'

const LoadingScreen = () => (
  <Box
    sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <CircularProgress color="inherit" />
  </Box>
)

const RequireAuth = () => {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <LoadingScreen />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

const RequireCompany = () => {
  const { company } = useAuth()
  if (!company) {
    return <Navigate to="/company-setup" replace />
  }

  return <Outlet />
}

const AppShellLayout = () => (
  <AppShell>
    <Outlet />
  </AppShell>
)

function App() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route
        path="/"
        element={
          <BenchErrorBoundary>
            <BenchPage />
          </BenchErrorBoundary>
        }
      />
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/company-setup" element={<CompanySetupPage />} />
        <Route element={<RequireCompany />}>
          <Route element={<AppShellLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/settings" element={<SettingsHomePage />} />
            <Route path="/settings/users" element={<UserManagementSettingsPage />} />
            <Route path="/settings/sessions" element={<ActiveSessionsSettingsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
