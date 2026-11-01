import { Alert, Button, Link, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router'
import { AuthLayout } from '../../components/AuthLayout.tsx'
import { PasswordField } from '../../components/PasswordField.tsx'
import { useAuth } from '../../auth/useAuth.ts'

export const ResetPasswordPage = () => {
  const { resetPassword } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [token, setToken] = useState(params.get('token') ?? '')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setStatus(null)
    setBusy(true)

    try {
      await resetPassword({ email, token, password, confirmation })
      setStatus('Password reset. You can log in now.')
      setTimeout(() => navigate('/login'), 1200)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Use the token from your reset email to set a new password and get back in."
      footer={
        <Link component={RouterLink} to="/login" underline="hover">
          Back to login
        </Link>
      }
    >
      <Stack spacing={2} component="form" onSubmit={handleSubmit}>
        <Typography variant="h4" sx={{ fontFamily: '"Saira Condensed", "Saira", sans-serif' }}>
          Reset password
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Enter the reset token and a new password below.
        </Typography>
        {status ? <Alert severity="success">{status}</Alert> : null}
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          fullWidth
        />
        <TextField
          label="Reset token"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          fullWidth
        />
        <PasswordField
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        <PasswordField
          label="Confirm password"
          value={confirmation}
          onChange={setConfirmation}
          autoComplete="new-password"
        />
        <Button type="submit" variant="contained" size="large" disabled={busy}>
          {busy ? 'Updating...' : 'Reset password'}
        </Button>
      </Stack>
    </AuthLayout>
  )
}
