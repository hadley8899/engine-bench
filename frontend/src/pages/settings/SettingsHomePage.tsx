import { Button, Card, CardActions, CardContent, Grid, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'

type SettingsSectionCardProps = {
  title: string
  description: string
  to: string
  cta: string
}

const SettingsSectionCard = ({ title, description, to, cta }: SettingsSectionCardProps) => (
  <Card variant="outlined">
    <CardContent>
      <Stack spacing={1}>
        <Typography variant="h6">{title}</Typography>
        <Typography color="text.secondary">{description}</Typography>
      </Stack>
    </CardContent>
    <CardActions>
      <Button component={RouterLink} to={to} variant="contained" size="small">
        {cta}
      </Button>
    </CardActions>
  </Card>
)

export const SettingsHomePage = () => {
  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="overline" sx={{ letterSpacing: 4, color: 'text.secondary' }}>
          SETTINGS
        </Typography>
        <Typography variant="h3" sx={{ fontFamily: '"Saira Condensed", "Saira", sans-serif' }}>
          Settings
        </Typography>
        <Typography color="text.secondary">Choose a settings section to manage.</Typography>
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <SettingsSectionCard
            title="Active Sessions"
            description="Review signed-in browsers and revoke access to your account."
            to="/settings/sessions"
            cta="Manage Sessions"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <SettingsSectionCard
            title="User Management"
            description="Add, update, and remove users in your company."
            to="/settings/users"
            cta="Manage Users"
          />
        </Grid>
      </Grid>
    </Stack>
  )
}
