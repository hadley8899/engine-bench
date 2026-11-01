import { storagePrefix } from '../config'
import { appName } from '../config'
import { useEffect, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import {
  AppBar,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
  DashboardRounded,
  MenuRounded,
  SettingsRounded,
  WbSunnyRounded,
  DarkModeRounded,
  ComputerRounded,
  ChevronLeftRounded,
  ChevronRightRounded,
  LogoutRounded,
  NotificationsRounded,
} from '@mui/icons-material'
import { NavLink } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { useThemeMode } from '../useThemeMode'
import { fetchUnreadNotificationCount, listNotifications, markAllNotificationsRead, markNotificationRead } from '../services/notificationService'
import type { NotificationItem } from '../types/notification'

const drawerWidth = 260
const collapsedDrawerWidth = 84
const sidebarPreferenceKey = `${storagePrefix}:sidebar-collapsed`

const navItems = [
  { label: 'Dashboard', to: '/', icon: <DashboardRounded /> },
  { label: 'Settings', to: '/settings', icon: <SettingsRounded /> },
]

export const AppShell = ({ children }: { children: ReactNode }) => {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarPreference, setSidebarPreference] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') {
      return null
    }

    const savedPreference = window.localStorage.getItem(sidebarPreferenceKey)
    return savedPreference === null ? null : savedPreference === 'true'
  })
  const [themeAnchor, setThemeAnchor] = useState<null | HTMLElement>(null)
  const [notificationsAnchor, setNotificationsAnchor] = useState<null | HTMLElement>(null)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const theme = useTheme()
  const hasPermanentSidebar = useMediaQuery(theme.breakpoints.up('md'))
  const isWideViewport = useMediaQuery(theme.breakpoints.up('lg'))
  const { user, company, logout } = useAuth()
  const { mode, setMode } = useThemeMode()
  const sidebarCollapsed = hasPermanentSidebar && (sidebarPreference ?? !isWideViewport)
  const currentDrawerWidth = sidebarCollapsed ? collapsedDrawerWidth : drawerWidth

  const toggleDrawer = () => setMobileOpen((prev) => !prev)
  const toggleSidebar = () => {
    const nextCollapsed = !sidebarCollapsed
    setSidebarPreference(nextCollapsed)
    window.localStorage.setItem(sidebarPreferenceKey, String(nextCollapsed))
  }

  useEffect(() => {
    let cancelled = false

    const refreshUnreadCount = async () => {
      try {
        const count = await fetchUnreadNotificationCount()
        if (!cancelled) {
          setUnreadCount(count)
        }
      } catch (error) {
        void error
      }
    }

    void refreshUnreadCount()
    const intervalId = window.setInterval(() => {
      void refreshUnreadCount()
    }, 30000)

    return () => {
      cancelled = true
      if (intervalId) {
        window.clearInterval(intervalId)
      }
    }
  }, [])

  const openNotificationsMenu = async (event: MouseEvent<HTMLElement>) => {
    setNotificationsAnchor(event.currentTarget)
    try {
      const items = await listNotifications()
      setNotifications(items)
      setUnreadCount(items.filter((item) => !item.read_at).length)
    } catch {
      setNotifications([])
    }
  }

  const handleMarkAllNotificationsRead = async () => {
    try {
      await markAllNotificationsRead()
      setNotifications((prev) => prev.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })))
      setUnreadCount(0)
    } catch (error) {
      void error
    }
  }

  const drawerContent = (
    <Box
      sx={{
        px: sidebarCollapsed ? 1.25 : 2,
        py: 2,
        overflow: 'hidden',
        transition: theme.transitions.create('padding', {
          easing: theme.transitions.easing.sharp,
          duration: theme.transitions.duration.shorter,
        }),
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent={sidebarCollapsed ? 'center' : 'space-between'}
        sx={{ minHeight: 48, px: sidebarCollapsed ? 0 : 1.5, mb: 2 }}
      >
        {!sidebarCollapsed ? (
          <Typography
            variant="h6"
            noWrap
            sx={{ fontFamily: '"Saira Condensed", "Saira", sans-serif', minWidth: 0 }}
          >
            {company?.name ?? 'Your company'}
          </Typography>
        ) : null}
        {hasPermanentSidebar ? (
          <Tooltip title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
            <IconButton
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!sidebarCollapsed}
              size="small"
              sx={{
                border: (themeValue) => `1px solid ${themeValue.palette.divider}`,
                backgroundColor: (themeValue) => themeValue.palette.background.default,
                '&:hover': {
                  backgroundColor: (themeValue) => themeValue.palette.action.hover,
                },
              }}
            >
              {sidebarCollapsed ? <ChevronRightRounded /> : <ChevronLeftRounded />}
            </IconButton>
          </Tooltip>
        ) : null}
      </Stack>
      <List sx={{ display: 'grid', gap: 1 }}>
        {navItems.map((item) => {
          const navButton = (
            <ListItemButton
              key={item.label}
              component={NavLink}
              to={item.to}
              onClick={() => {
                if (!hasPermanentSidebar) {
                  setMobileOpen(false)
                }
              }}
              aria-label={sidebarCollapsed ? item.label : undefined}
              sx={{
                minHeight: 48,
                justifyContent: sidebarCollapsed ? 'center' : 'initial',
                px: sidebarCollapsed ? 1 : 2,
                borderRadius: 3,
                '&.active': {
                  backgroundColor: (themeValue) => themeValue.palette.action.selected,
                  color: 'primary.main',
                },
                '&.active .MuiListItemIcon-root': {
                  color: 'primary.main',
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: sidebarCollapsed ? 0 : 42,
                  justifyContent: 'center',
                }}
              >
                {item.icon}
              </ListItemIcon>
              {!sidebarCollapsed ? <ListItemText primary={item.label} /> : null}
            </ListItemButton>
          )

          return sidebarCollapsed ? (
            <Tooltip key={item.label} title={item.label} placement="right" arrow>
              {navButton}
            </Tooltip>
          ) : (
            navButton
          )
        })}
      </List>
      {!sidebarCollapsed ? (
        <>
          <Divider sx={{ my: 3 }} />
          <Stack spacing={1} sx={{ px: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              Signed in as
            </Typography>
            <Typography variant="body2">{user?.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {user?.email}
            </Typography>
          </Stack>
        </>
      ) : null}
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        color="transparent"
        elevation={0}
        sx={{
          backdropFilter: 'blur(18px)',
          backgroundColor: (themeValue) => themeValue.palette.background.paper,
          borderBottom: (themeValue) => `1px solid ${themeValue.palette.divider}`,
          borderRadius: 0,
          px: { xs: 1, lg: 3 },
          zIndex: (themeValue) => themeValue.zIndex.drawer + 1,
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 64, md: 72 } }}>
          {!hasPermanentSidebar ? (
            <IconButton
              onClick={toggleDrawer}
              size="large"
              aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={mobileOpen}
            >
              <MenuRounded />
            </IconButton>
          ) : null}
          <Typography variant="h6">{appName}</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Notifications">
              <IconButton size="large" onClick={(event) => void openNotificationsMenu(event)}>
                <Badge color="error" badgeContent={unreadCount} max={99}>
                  <NotificationsRounded />
                </Badge>
              </IconButton>
            </Tooltip>
            <Tooltip title="Theme">
              <IconButton size="large" onClick={(event) => setThemeAnchor(event.currentTarget)}>
                {mode === 'dark' ? <DarkModeRounded /> : mode === 'light' ? <WbSunnyRounded /> : <ComputerRounded />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Logout">
              <IconButton size="large" onClick={() => void logout()}>
                <LogoutRounded />
              </IconButton>
            </Tooltip>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        aria-label="Main navigation"
        sx={{
          width: { md: currentDrawerWidth },
          flexShrink: { md: 0 },
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        <Drawer
          variant={hasPermanentSidebar ? 'permanent' : 'temporary'}
          open={hasPermanentSidebar || mobileOpen}
          onClose={toggleDrawer}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: hasPermanentSidebar ? currentDrawerWidth : `min(${drawerWidth}px, calc(100vw - 40px))`,
              overflowX: 'hidden',
              borderRight: (themeValue) => `1px solid ${themeValue.palette.divider}`,
              borderRadius: 0,
              backgroundColor: (themeValue) =>
                themeValue.palette.mode === 'light'
                  ? themeValue.palette.background.paper
                  : 'rgba(15, 23, 42, 0.6)',
              backdropFilter: (themeValue) =>
                themeValue.palette.mode === 'dark' ? 'blur(18px)' : 'none',
              transition: theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.enteringScreen,
              }),
            },
          }}
        >
          <Toolbar sx={{ minHeight: { xs: 64, md: 72 } }} />
          {drawerContent}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          px: { xs: 2, md: 4 },
          py: { xs: 3, md: 4 },
          mt: { xs: 8, md: 9 },
        }}
      >
        {children}
      </Box>

      <Menu
        anchorEl={themeAnchor}
        open={Boolean(themeAnchor)}
        onClose={() => setThemeAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          selected={mode === 'light'}
          onClick={() => {
            setMode('light')
            setThemeAnchor(null)
          }}
        >
          <ListItemIcon>
            <WbSunnyRounded />
          </ListItemIcon>
          Light
        </MenuItem>
        <MenuItem
          selected={mode === 'dark'}
          onClick={() => {
            setMode('dark')
            setThemeAnchor(null)
          }}
        >
          <ListItemIcon>
            <DarkModeRounded />
          </ListItemIcon>
          Dark
        </MenuItem>
        <MenuItem
          selected={mode === 'system'}
          onClick={() => {
            setMode('system')
            setThemeAnchor(null)
          }}
        >
          <ListItemIcon>
            <ComputerRounded />
          </ListItemIcon>
          System
        </MenuItem>
      </Menu>

      <Menu
        anchorEl={notificationsAnchor}
        open={Boolean(notificationsAnchor)}
        onClose={() => setNotificationsAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ '& .MuiPaper-root': { width: 380, maxWidth: 'calc(100vw - 24px)' } }}
      >
        <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
          <Button
            size="small"
            onClick={() => void handleMarkAllNotificationsRead()}
            disabled={unreadCount === 0}
          >
            Mark all as read
          </Button>
        </Box>
        <Divider />
        {notifications.length === 0 ? (
          <MenuItem disabled>No notifications</MenuItem>
        ) : (
          notifications.slice(0, 12).map((item) => {
            const title = typeof item.data.title === 'string' ? item.data.title : item.type
            const message = typeof item.data.message === 'string' ? item.data.message : ''
            const isUnread = !item.read_at

            return (
              <MenuItem
                key={item.id}
                onClick={async () => {
                  if (isUnread) {
                    try {
                      await markNotificationRead(item.id)
                      setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n)))
                      setUnreadCount((prev) => Math.max(0, prev - 1))
                    } catch (error) {
                      void error
                    }
                  }
                }}
                sx={{
                  display: 'block',
                  whiteSpace: 'normal',
                  py: 1,
                  backgroundColor: isUnread ? 'action.hover' : undefined,
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {title}
                </Typography>
                {message ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {message}
                  </Typography>
                ) : null}
              </MenuItem>
            )
          })
        )}
      </Menu>
    </Box>
  )
}
