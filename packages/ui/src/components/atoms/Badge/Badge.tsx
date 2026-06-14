import type { ReactNode } from 'react'
import './Badge.css'

export type BadgeVariant =
  | 'default'
  | 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'amber' | 'bmad' | 'violet'
  | 'story' | 'task' | 'bug' | 'subtask' | 'spike'
  | 'critical' | 'high' | 'medium' | 'low'
  | 'community' | 'pro' | 'team' | 'enterprise'

export type BadgeSize = 'sm' | 'md' | 'lg'

export interface BadgeProps {
  variant?: BadgeVariant
  size?: BadgeSize
  icon?: ReactNode
  children: ReactNode
  className?: string
}

export function Badge({
  variant = 'default',
  size = 'md',
  icon,
  children,
  className = '',
}: BadgeProps) {
  const classes = [
    'kk-badge',
    variant !== 'default' && `kk-badge-${variant}`,
    size !== 'md' && `kk-badge-${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes}>
      {icon}
      {children}
    </span>
  )
}
