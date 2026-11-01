import { Button, Link, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router'
import { AuthLayout } from '../../components/AuthLayout.tsx'
import { PasswordField } from '../../components/PasswordField.tsx'
import { useAuth } from '../../auth/useAuth.ts'

export const RegisterPage = () => {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)

    try {
      const response = await register(name, email, password, confirmation)
      navigate('/login', { state: { notice: response.message } })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Start fresh"
      subtitle="Create your account to get started."
      footer={
        <Link component={RouterLink} to="/login" underline="hover">
          Already have an account? Sign in
        </Link>
      }
    >
      <Stack spacing={2} component="form" onSubmit={handleSubmit}>
        <Typography variant="h4" sx={{ fontFamily: '"Saira Condensed", "Saira", sans-serif' }}>
          Register
        </Typography>
        <Typography variant="body2" color="text.secondary">
          A few details and you are ready to go.
        </Typography>
        <TextField
          label="Full name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          fullWidth
        />
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
          autoComplete="new-password"
        />
        <PasswordField
          label="Confirm password"
          value={confirmation}
          onChange={setConfirmation}
          autoComplete="new-password"
        />
        <Button type="submit" variant="contained" size="large" disabled={busy}>
          {busy ? 'Creating...' : 'Create account'}
        </Button>
      </Stack>
    </AuthLayout>
  )
}
