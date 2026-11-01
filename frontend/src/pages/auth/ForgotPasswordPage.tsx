import { Alert, Button, Link, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { AuthLayout } from '../../components/AuthLayout.tsx'
import { useAuth } from '../../auth/useAuth.ts'

export const ForgotPasswordPage = () => {
  const { forgotPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setStatus(null)
    setToken(null)
    setBusy(true)

    try {
      const response = await forgotPassword(email)
      setStatus('Reset link sent. Check your email for next steps.')
      if (response.token) {
        setToken(response.token)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Reset access"
      subtitle="Tell us the email connected to your account and we will send a reset link."
      footer={
        <Link component={RouterLink} to="/login" underline="hover">
          Back to login
        </Link>
      }
    >
      <Stack spacing={2} component="form" onSubmit={handleSubmit}>
        <Typography variant="h4" sx={{ fontFamily: '"Saira Condensed", "Saira", sans-serif' }}>
          Forgot password
        </Typography>
        <Typography variant="body2" color="text.secondary">
          We will email you a secure reset link.
        </Typography>
        {status ? <Alert severity="success">{status}</Alert> : null}
        {token ? (
          <Alert severity="info">
            Local reset token: {token}. Add it to the reset form if you are testing locally.
          </Alert>
        ) : null}
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          fullWidth
        />
        <Button type="submit" variant="contained" size="large" disabled={busy}>
          {busy ? 'Sending...' : 'Send reset link'}
        </Button>
        <Link component={RouterLink} to="/reset-password" underline="hover">
          Already have a reset token? Finish resetting
        </Link>
      </Stack>
    </AuthLayout>
  )
}
