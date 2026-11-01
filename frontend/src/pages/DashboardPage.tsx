import { Button, Paper, Stack, Typography } from '@mui/material'
import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { appName } from '../config'

export const DashboardPage = () => {
  const { user, company } = useAuth()
  return (
    <Stack spacing={3}>
      <Typography variant="h3">{appName}</Typography>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h5">Welcome, {user?.name}</Typography>
          <Typography color="text.secondary">Your workspace, {company?.name}, is ready.</Typography>
          <Button component={Link} to="/settings" sx={{ alignSelf: 'flex-start' }}>Open settings</Button>
        </Stack>
      </Paper>
    </Stack>
  )
}
