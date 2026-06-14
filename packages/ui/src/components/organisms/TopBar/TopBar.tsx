import { Breadcrumb, type BreadcrumbItem } from '../../molecules/Breadcrumb/Breadcrumb'
import { SearchInput } from '../../atoms/SearchInput/SearchInput'
import { IconButton } from '../../atoms/IconButton/IconButton'
import { Icon } from '../../atoms/Icon/Icon'
import './TopBar.css'

export interface TopBarProps {
  breadcrumbs: BreadcrumbItem[]
  hasNotification?: boolean
  panelOpen?: boolean
  isDark?: boolean
  onSearchOpen?: () => void
  onNotificationClick?: () => void
  onThemeToggle?: () => void
  onNewClick?: () => void
  onPanelToggle?: () => void
}

export function TopBar({
  breadcrumbs,
  hasNotification,
  panelOpen,
  isDark = false,
  onSearchOpen,
  onNotificationClick,
  onThemeToggle,
  onNewClick,
  onPanelToggle,
}: TopBarProps) {
  return (
    <header className="kk-topbar">
      <Breadcrumb items={breadcrumbs} />
      <div className="kk-topbar-right">
        <SearchInput
          placeholder="Search…"
          kbdHint="⌘K"
          onFocus={onSearchOpen}
          className="kk-topbar-search"
          readOnly
        />
        <IconButton
          icon={<Icon name="Bell" size={15} />}
          label="Notifications"
          dot={hasNotification}
          onClick={onNotificationClick}
        />
        <IconButton
          icon={<Icon name={isDark ? 'Sun' : 'Moon'} size={15} />}
          label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          active={isDark}
          className="kk-topbar-theme-toggle"
          onClick={onThemeToggle}
        />
        <IconButton
          icon={<Icon name="Plus" size={15} />}
          label="New"
          variant="primary"
          onClick={onNewClick}
        />
        <IconButton
          icon={<Icon name="PanelRight" size={15} />}
          label="Toggle context panel"
          active={panelOpen}
          onClick={onPanelToggle}
        />
      </div>
    </header>
  )
}
