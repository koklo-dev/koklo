import { Icon, type IconName } from '../../atoms/Icon/Icon'
import { Avatar } from '../../atoms/Avatar/Avatar'
import { Button } from '../../atoms/Button/Button'
import { NavItem } from '../../molecules/NavItem/NavItem'
import './Sidebar.css'

// NOTE: vendored from koklo-storybook with the OrgSwitcher/ProjectSwitcher
// dropdowns omitted — those land with the full DS port (US-020). The org/project
// triggers render statically here; wiring them is out of scope for US-017.

export interface SidebarNavItem {
  id: string
  icon: IconName
  label: string
  count?: number
}

export interface SidebarProps {
  orgName: string
  orgColor?: string
  orgTier?: string
  projectName?: string
  user: { name: string; email: string; role?: string; color?: string }
  navItems?: SidebarNavItem[]
  activeItemId?: string
  collapsed?: boolean
  onNavClick?: (id: string) => void
  onNewSession?: () => void
  onSettingsClick?: () => void
  onCollapseToggle?: () => void
}

const defaultNavItems: SidebarNavItem[] = [
  { id: 'home', icon: 'Home', label: 'Home' },
  { id: 'sessions', icon: 'Sparkles', label: 'Sessions' },
  { id: 'files', icon: 'Folder', label: 'Files' },
  { id: 'tasks', icon: 'Tasks', label: 'Tasks' },
  { id: 'workflows', icon: 'Workflow', label: 'Workflows' },
  { id: 'versioning', icon: 'Branch', label: 'Versioning' },
  { id: 'constellation', icon: 'Constellation', label: 'Constellation' },
  { id: 'marketplace', icon: 'Marketplace', label: 'Marketplace' },
]

export function Sidebar({
  orgName,
  orgColor,
  orgTier,
  projectName,
  user,
  navItems = defaultNavItems,
  activeItemId = 'home',
  collapsed = false,
  onNavClick,
  onNewSession,
  onSettingsClick,
}: SidebarProps) {
  return (
    <aside className={`kk-sidebar ${collapsed ? 'kk-sidebar-collapsed' : ''}`} aria-label="Main navigation">
      {/* Zone 1 — Org/Project switcher */}
      <div className="kk-sidebar-zone1">
        {collapsed ? (
          <Avatar name={orgName} color={orgColor ?? '#1E3A5F'} shape="square" size="md" />
        ) : (
          <>
            <div className="kk-sidebar-org-trigger">
              <Avatar name={orgName} color={orgColor ?? '#1E3A5F'} shape="square" size="md" />
              <div className="kk-sidebar-org-info">
                <span className="kk-sidebar-org-name">{orgName}</span>
                {orgTier && <span className="kk-sidebar-org-tier">{orgTier.toUpperCase()}</span>}
              </div>
            </div>

            {projectName && (
              <div className="kk-sidebar-proj-trigger">
                <Icon name="ChevronRight" size={12} color="rgba(231,229,228,0.5)" />
                <span className="kk-sidebar-proj-name">{projectName}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Zone 2 — Nav */}
      <div className="kk-sidebar-zone2">
        {!collapsed && (
          <Button
            variant="primary"
            size="sm"
            icon={<Icon name="Plus" size={13} />}
            className="kk-sidebar-new-btn"
            onClick={onNewSession}
          >
            New session
          </Button>
        )}
        {collapsed && (
          <button
            type="button"
            className="kk-sidebar-icon-new"
            onClick={onNewSession}
            aria-label="New session"
            title="New session"
          >
            <Icon name="Plus" size={15} color="var(--color-sidebar-text)" />
          </button>
        )}

        <nav className="kk-sidebar-nav">
          {navItems.map(item => (
            <NavItem
              key={item.id}
              icon={<Icon name={item.icon} size={15} />}
              label={item.label}
              count={item.count}
              active={item.id === activeItemId}
              collapsed={collapsed}
              onClick={() => onNavClick?.(item.id)}
            />
          ))}
        </nav>
      </div>

      {/* Zone 3 — User */}
      <div className="kk-sidebar-zone3">
        <NavItem
          icon={<Icon name="Settings" size={15} />}
          label="Settings"
          collapsed={collapsed}
          onClick={onSettingsClick}
        />

        {!collapsed && (
          <div className="kk-sidebar-user">
            <Avatar name={user.name} color={user.color} size="xs" />
            <div className="kk-sidebar-user-info">
              <span className="kk-sidebar-user-name">{user.name}</span>
              <span className="kk-sidebar-user-role">{user.role ?? user.email}</span>
            </div>
          </div>
        )}
        {collapsed && <Avatar name={user.name} color={user.color} size="xs" />}
      </div>
    </aside>
  )
}
