import type { ReactNode } from 'react'
import { Sidebar, type SidebarProps } from '../Sidebar/Sidebar'
import { TopBar, type TopBarProps } from '../TopBar/TopBar'
import './Shell.css'

export interface ShellProps {
  /** Sidebar configuration */
  sidebar: Omit<SidebarProps, 'onNavClick' | 'onNewSession' | 'onSettingsClick' | 'onCollapseToggle'>
  /** TopBar configuration */
  topbar: Omit<TopBarProps, 'onSearchOpen' | 'onNotificationClick' | 'onNewClick' | 'onPanelToggle'>
  /** Main content area */
  children?: ReactNode
  /** Right panel slot (TicketDetailPanel, ContextPanel, etc.) */
  rightPanel?: ReactNode
  /** Bottom slot (ComposerInput) */
  footer?: ReactNode
  /** Whether the right panel is visible */
  panelOpen?: boolean
  onNavClick?: (id: string) => void
  onNewSession?: () => void
  onPanelToggle?: () => void
  onCollapseToggle?: () => void
  className?: string
}

export function Shell({
  sidebar,
  topbar,
  children,
  rightPanel,
  footer,
  panelOpen,
  onNavClick,
  onNewSession,
  onPanelToggle,
  onCollapseToggle,
  className = '',
}: ShellProps) {
  return (
    <div className={`kk-shell ${className}`}>
      <Sidebar
        {...sidebar}
        onNavClick={onNavClick}
        onNewSession={onNewSession}
        onCollapseToggle={onCollapseToggle}
      />

      <div className="kk-shell-center">
        <TopBar
          {...topbar}
          panelOpen={panelOpen}
          onNewClick={onNewSession}
          onPanelToggle={onPanelToggle}
        />

        <main className="kk-shell-page">
          {children}
        </main>

        {footer && (
          <div className="kk-shell-footer">
            {footer}
          </div>
        )}
      </div>

      {panelOpen && rightPanel && (
        <div className="kk-shell-right">
          {rightPanel}
        </div>
      )}
    </div>
  )
}
