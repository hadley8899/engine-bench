import { Alert, Button, Chip, CircularProgress, Divider, Paper, Stack, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { deleteAllSessions, deleteSession, getSessions } from '../../services/authService'
import type { ApiSession } from '../../services/authService'

const formatDate = (value: string | null) => value
  ? new Date(value).toLocaleString()
  : 'Unknown'

export const ActiveSessionsSettingsPage = () => {
  const navigate = useNavigate()
  const { clearLocalSession } = useAuth()
  const [sessions, setSessions] = useState<ApiSession[]>([])
  const [loading, setLoading] = useState(true)
  const [busySessionUuid, setBusySessionUuid] = useState<string | null>(null)
  const [signingOutAll, setSigningOutAll] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void getSessions()
      .then((result) => {
        if (!cancelled) {
          setSessions(result)
          setError(null)
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load active sessions.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const signOutSession = async (session: ApiSession) => {
    if (!window.confirm(`Sign out ${session.is_current ? 'this session' : session.display_name}?`)) return

    setBusySessionUuid(session.uuid)
    setError(null)
    try {
      const result = await deleteSession(session.uuid)
      if (result.signed_out_current_session) {
        clearLocalSession()
        navigate('/login', { replace: true })
        return
      }
      setSessions((current) => current.filter((item) => item.uuid !== session.uuid))
    } catch {
      setError('Failed to sign out that session.')
    } finally {
      setBusySessionUuid(null)
    }
  }

  const signOutAll = async () => {
    if (!window.confirm('Sign out every session for your account, including this one?')) return

    setSigningOutAll(true)
    setError(null)
    try {
      await deleteAllSessions()
      clearLocalSession()
      navigate('/login', { replace: true })
    } catch {
      setError('Failed to sign out all sessions.')
      setSigningOutAll(false)
    }
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="overline" sx={{ letterSpacing: 4, color: 'text.secondary' }}>
          SETTINGS
        </Typography>
        <Typography variant="h3" sx={{ fontFamily: '"Saira Condensed", "Saira", sans-serif' }}>
          Active Sessions
        </Typography>
        <Typography color="text.secondary">
          Review the browsers and devices signed in to your account.
        </Typography>
      </Stack>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Paper elevation={0} className="auth-card" sx={{ p: { xs: 3, md: 4 } }}>
        {loading ? (
          <Stack alignItems="center" py={4}><CircularProgress /></Stack>
        ) : (
          <Stack spacing={2.5}>
            {sessions.length === 0 ? (
              <Typography color="text.secondary">No active sessions found.</Typography>
            ) : sessions.map((session, index) => (
              <Stack key={session.uuid} spacing={2}>
                {index > 0 ? <Divider /> : null}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ sm: 'center' }}>
                  <Stack spacing={0.5}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="h6">{session.display_name}</Typography>
                      {session.is_current ? <Chip label="Current session" color="success" size="small" /> : null}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      IP address: {session.ip_address ?? 'Unknown'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Last active: {formatDate(session.last_used_at)} · Signed in: {formatDate(session.created_at)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Stays signed in while active · Idle expiry: {formatDate(session.expires_at)}
                    </Typography>
                  </Stack>
                  <Button
                    variant="outlined"
                    color="error"
                    disabled={busySessionUuid !== null || signingOutAll}
                    onClick={() => void signOutSession(session)}
                  >
                    {busySessionUuid === session.uuid ? 'Signing out...' : 'Sign out'}
                  </Button>
                </Stack>
              </Stack>
            ))}

            <Divider />
            <Stack spacing={1} alignItems="flex-start">
              <Typography variant="h6">Sign out everywhere</Typography>
              <Typography variant="body2" color="text.secondary">
                Revokes every active session for your account, including this browser.
              </Typography>
              <Button variant="contained" color="error" disabled={signingOutAll || loading} onClick={() => void signOutAll()}>
                {signingOutAll ? 'Signing out...' : 'Sign out all sessions'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Paper>
    </Stack>
  )
}
