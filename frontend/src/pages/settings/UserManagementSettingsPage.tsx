import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import {
  addCompanyUser,
  listCompanyUsers,
  removeCompanyUser,
  updateCompany,
  updateCompanyUser,
} from '../../services/companyService'
import type { CompanyUser } from '../../types/company'

export const UserManagementSettingsPage = () => {
  const { role, company, refreshUser } = useAuth()
  const [users, setUsers] = useState<CompanyUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [companySaving, setCompanySaving] = useState(false)
  const [companyNameDraft, setCompanyNameDraft] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [activeUser, setActiveUser] = useState<CompanyUser | null>(null)
  const [form, setForm] = useState({ name: '', email: '', role: 'user' })
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'user' })

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const data = await listCompanyUsers()
      setUsers(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchUsers()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [])

  const companyName = companyNameDraft ?? company?.name ?? ''
  const canManage = role === 'admin'
  const isReady = useMemo(() => form.name.trim() && form.email.trim(), [form])
  const canSaveCompany = useMemo(() => companyName.trim().length > 0, [companyName])
  const canSaveEdit = useMemo(() => editForm.name.trim() && editForm.email.trim(), [editForm])

  const handleAddUser = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)

    try {
      await addCompanyUser({ name: form.name, email: form.email, role: form.role as 'admin' | 'user' })
      setForm({ name: '', email: '', role: 'user' })
      setAddOpen(false)
      await fetchUsers()
    } finally {
      setSaving(false)
    }
  }

  const handleRoleChange = async (userUuid: string, nextRole: 'admin' | 'user') => {
    await updateCompanyUser(userUuid, { role: nextRole })
    await fetchUsers()
  }

  const handleRemove = async (userUuid: string) => {
    await removeCompanyUser(userUuid)
    await fetchUsers()
  }

  const handleCompanyUpdate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!companyName.trim()) {
      return
    }

    setCompanySaving(true)
    try {
      await updateCompany({ name: companyName.trim() })
      await refreshUser()
      setCompanyNameDraft(null)
    } finally {
      setCompanySaving(false)
    }
  }

  const openEditUser = (member: CompanyUser) => {
    setActiveUser(member)
    setEditForm({
      name: member.user.name,
      email: member.user.email,
      role: member.role,
    })
    setEditOpen(true)
  }

  const handleUpdateUser = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!activeUser) {
      return
    }

    setSaving(true)
    try {
      await updateCompanyUser(activeUser.uuid, {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        role: editForm.role as 'admin' | 'user',
      })
      setEditOpen(false)
      setActiveUser(null)
      await fetchUsers()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="overline" sx={{ letterSpacing: 4, color: 'text.secondary' }}>
          SETTINGS
        </Typography>
        <Typography variant="h3" sx={{ fontFamily: '"Saira Condensed", "Saira", sans-serif' }}>
          User Management
        </Typography>
      </Stack>

      <Paper elevation={0} className="auth-card" sx={{ p: { xs: 3, md: 4 } }}>
        <Stack spacing={2} component="form" onSubmit={handleCompanyUpdate}>
          <Typography variant="h6">Company profile</Typography>
          <TextField
            label="Company name"
            value={companyName}
            onChange={(event) => setCompanyNameDraft(event.target.value)}
            fullWidth
            disabled={!canManage}
          />
          <Button type="submit" variant="contained" disabled={!canManage || !canSaveCompany || companySaving}>
            {companySaving ? 'Saving...' : 'Update company'}
          </Button>
          {!canManage ? <Alert severity="info">Only admins can update company details.</Alert> : null}
        </Stack>
      </Paper>

      <Paper elevation={0} className="auth-card" sx={{ p: { xs: 3, md: 4 } }}>
        <Stack spacing={2}>
          <Typography variant="h6">Current users</Typography>
          {loading ? (
            <Typography color="text.secondary">Loading users...</Typography>
          ) : users.length === 0 ? (
            <Typography color="text.secondary">No team members yet.</Typography>
          ) : (
            <Stack spacing={2}>
              {users.map((member) => (
                <Stack
                  key={member.uuid}
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={2}
                  alignItems={{ xs: 'flex-start', md: 'center' }}
                  justifyContent="space-between"
                >
                  <Stack spacing={0.5}>
                    <Typography>{member.user.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {member.user.email}
                    </Typography>
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
                    <TextField
                      select
                      size="small"
                      label="Role"
                      value={member.role}
                      onChange={(event) => void handleRoleChange(member.uuid, event.target.value as 'admin' | 'user')}
                      disabled={!canManage}
                      sx={{ minWidth: 140 }}
                    >
                      <MenuItem value="admin">Admin</MenuItem>
                      <MenuItem value="user">User</MenuItem>
                    </TextField>
                    <Button size="small" variant="outlined" onClick={() => openEditUser(member)} disabled={!canManage}>
                      Edit
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      variant="outlined"
                      onClick={() => void handleRemove(member.uuid)}
                      disabled={!canManage}
                    >
                      Remove
                    </Button>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
        </Stack>
      </Paper>

      <Paper elevation={0} className="auth-card" sx={{ p: { xs: 3, md: 4 } }}>
        <Stack spacing={2}>
          <Typography variant="h6">Add a user</Typography>
          <Typography color="text.secondary" variant="body2">
            New users receive a reset link to set their password.
          </Typography>
          <Button variant="contained" onClick={() => setAddOpen(true)} disabled={!canManage}>
            Add user
          </Button>
          {!canManage ? <Alert severity="info">Only admins can manage team members.</Alert> : null}
        </Stack>
      </Paper>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add a user</DialogTitle>
        <DialogContent>
          <Stack spacing={2} component="form" id="add-user-form" onSubmit={handleAddUser} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              fullWidth
              disabled={!canManage}
            />
            <TextField
              label="Email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              fullWidth
              disabled={!canManage}
            />
            <TextField
              select
              label="Role"
              value={form.role}
              onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
              fullWidth
              disabled={!canManage}
            >
              <MenuItem value="admin">Admin</MenuItem>
              <MenuItem value="user">User</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button type="submit" form="add-user-form" variant="contained" disabled={!isReady || saving || !canManage}>
            {saving ? 'Adding...' : 'Add user'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={editOpen}
        onClose={() => {
          setEditOpen(false)
          setActiveUser(null)
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Edit user</DialogTitle>
        <DialogContent>
          <Stack spacing={2} component="form" id="edit-user-form" onSubmit={handleUpdateUser} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={editForm.name}
              onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
              fullWidth
              disabled={!canManage}
            />
            <TextField
              label="Email"
              value={editForm.email}
              onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))}
              fullWidth
              disabled={!canManage}
            />
            <TextField
              select
              label="Role"
              value={editForm.role}
              onChange={(event) => setEditForm((prev) => ({ ...prev, role: event.target.value }))}
              fullWidth
              disabled={!canManage}
            >
              <MenuItem value="admin">Admin</MenuItem>
              <MenuItem value="user">User</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button type="submit" form="edit-user-form" variant="contained" disabled={!canSaveEdit || saving || !canManage}>
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
