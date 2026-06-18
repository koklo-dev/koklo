import type { ReactNode } from 'react'
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
  /** Mark the header as a native drag region (Tauri / Electron frameless windows). */
  dragRegion?: boolean
  /** Slot rendered before the breadcrumb — use for a logo or app icon. */
  leadingSlot?: ReactNode
  /** Slot rendered after all action buttons — use for window controls or custom actions. */
  trailingSlot?: ReactNode
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
  dragRegion = false,
  leadingSlot,
  trailingSlot,
  onSearchOpen,
  onNotificationClick,
  onThemeToggle,
  onNewClick,
  onPanelToggle,
}: TopBarProps) {
  return (
    <header
      className="kk-topbar"
      {...(dragRegion ? { 'data-tauri-drag-region': '' } : {})}
    >
      {leadingSlot}
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
      {trailingSlot}
    </header>
  )
}
