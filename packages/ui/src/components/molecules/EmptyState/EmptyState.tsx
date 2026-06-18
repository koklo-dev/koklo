import type { ReactNode } from 'react'
import './EmptyState.css'

export interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
  className?: string
}

export function EmptyState({ title, description, action, icon, className = '' }: EmptyStateProps) {
  return (
    <div className={`kk-empty ${className}`}>
      {icon && <div className="kk-empty-icon">{icon}</div>}
      <h3 className="kk-empty-title">{title}</h3>
      {description && <p className="kk-empty-desc">{description}</p>}
      {action && <div className="kk-empty-action">{action}</div>}
    </div>
  )
}
