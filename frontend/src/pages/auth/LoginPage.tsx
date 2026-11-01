import { Alert, Button, Link, Snackbar, Stack, TextField, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router'
import { AuthLayout } from '../../components/AuthLayout.tsx'
import { PasswordField } from '../../components/PasswordField.tsx'
import { useAuth } from '../../auth/useAuth.ts'

export const LoginPage = () => {
  const { login, resendVerification } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const locationNotice = (location.state as { notice?: string } | null)?.notice ?? null
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(locationNotice)
  const [noticeOpen, setNoticeOpen] = useState(Boolean(locationNotice))
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    if (locationNotice) {
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, locationNotice, navigate])

  useEffect(() => {
    if (resendCooldown <= 0) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setResendCooldown((value) => Math.max(0, value - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [resendCooldown])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)

    try {
      await login(email, password)
      navigate('/')
    } finally {
      setBusy(false)
    }
  }

  const handleResend = async () => {
    if (!email || resendCooldown > 0) {
      return
    }

    try {
      const response = await resendVerification(email)
      setNotice(response.message)
      setNoticeOpen(true)
      setResendCooldown(60)
    } finally {
      setResendCooldown(0);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your account."
      footer={
        <Link component={RouterLink} to="/register" underline="hover">
          Need an account? Create one
        </Link>
      }
    >
      <Stack spacing={2} component="form" onSubmit={handleSubmit}>
        <Typography variant="h4" sx={{ fontFamily: '"Saira Condensed", "Saira", sans-serif' }}>
          Login
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Use your email address and password to continue.
        </Typography>
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          fullWidth
        />
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        <Button type="submit" variant="contained" size="large" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </Button>
        <Stack spacing={0.5}>
          <Button
            variant="text"
            size="small"
            onClick={handleResend}
            disabled={!email || resendCooldown > 0}
          >
            Resend verification email
          </Button>
          <Typography variant="caption" color="text.secondary">
            {resendCooldown > 0
              ? `You can resend in ${resendCooldown}s.`
              : 'Use the email address you registered with.'}
          </Typography>
        </Stack>
        <Link component={RouterLink} to="/forgot-password" underline="hover">
          Forgot your password?
        </Link>
      </Stack>
      {typeof document !== 'undefined'
        ? createPortal(
            <Snackbar
              open={noticeOpen}
              autoHideDuration={5000}
              onClose={() => setNoticeOpen(false)}
              anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
              sx={{ position: 'fixed', top: 24 }}
            >
              <Alert severity="success" onClose={() => setNoticeOpen(false)}>
                {notice}
              </Alert>
            </Snackbar>,
            document.body,
          )
        : null}
    </AuthLayout>
  )
}
