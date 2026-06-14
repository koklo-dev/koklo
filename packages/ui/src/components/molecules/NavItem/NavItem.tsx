import type { ReactNode } from 'react'
import './NavItem.css'

export interface NavItemProps {
  icon?: ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  count?: number
  collapsed?: boolean
  onClick?: () => void
  className?: string
}

export function NavItem({ icon, label, active, disabled, count, collapsed, onClick, className = '' }: NavItemProps) {
  return (
    <button
      type="button"
      className={[
        'kk-nav-item',
        active && 'kk-nav-item-active',
        collapsed && 'kk-nav-item-collapsed',
        className,
      ].filter(Boolean).join(' ')}
      disabled={disabled}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
    >
      {icon && <span className="kk-nav-item-icon" aria-hidden>{icon}</span>}
      {!collapsed && <span className="kk-nav-item-label">{label}</span>}
      {!collapsed && count !== undefined && count > 0 && (
        <span className="kk-nav-item-count" aria-label={`${count} éléments`}>{count}</span>
      )}
    </button>
  )
}
