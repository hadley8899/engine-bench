import { Button, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/useAuth.ts'
import { AuthLayout } from '../../components/AuthLayout.tsx'
import { setupCompany } from '../../services/companyService.ts'

export const CompanySetupPage = () => {
  const { refreshUser } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)

    try {
      await setupCompany(name)
      await refreshUser()
      navigate('/')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AuthLayout
      title="Set up your workspace"
      subtitle="Give your workspace a name to get started."
    >
      <Stack spacing={2} component="form" onSubmit={handleSubmit}>
        <Typography variant="h4" sx={{ fontFamily: '"Saira Condensed", "Saira", sans-serif' }}>
          Workspace details
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Choose a name your team will recognize on the dashboard.
        </Typography>
        <TextField
          label="Company name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          fullWidth
        />
        <Button type="submit" variant="contained" size="large" disabled={saving || !name.trim()}>
          {saving ? 'Saving...' : 'Create workspace'}
        </Button>
      </Stack>
    </AuthLayout>
  )
}
