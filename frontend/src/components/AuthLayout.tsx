import { appName } from '../config'
import { Box, Container, Grid, Paper, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'

type AuthLayoutProps = {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}

export const AuthLayout = ({ title, subtitle, children, footer }: AuthLayoutProps) => {
  return (
    <Box className="app-shell">
      <Container maxWidth="lg">
        <Grid container spacing={4} alignItems="stretch">
          <Grid size={{ xs: 12, lg: 5 }} sx={{ display: 'flex' }}>
            <Stack spacing={3} className="fade-in">
              <Typography variant="h5">{appName}</Typography>
              <Typography variant="h2" sx={{ fontFamily: '"Saira Condensed", "Saira", sans-serif' }}>
                {title}
              </Typography>
              <Typography variant="body1" sx={{ maxWidth: 360, color: 'text.secondary' }}>
                {subtitle}
              </Typography>
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, lg: 7 }} sx={{ display: 'flex' }}>
            <Paper
              elevation={0}
              className="auth-card"
              sx={{
                p: { xs: 3, md: 5 },
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                minHeight: { xs: 'auto', lg: 520 },
              }}
            >
              <Stack spacing={3} className="stagger">
                {children}
              </Stack>
                {footer ? (
                    <Box mt={2} textAlign={{ xs: 'left' }}>
                        {footer}
                    </Box>
                ) : null}
            </Paper>

          </Grid>
        </Grid>
      </Container>
    </Box>
  )
}
