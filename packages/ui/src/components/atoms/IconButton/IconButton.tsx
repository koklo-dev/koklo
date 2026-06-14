import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './IconButton.css'

export type IconButtonVariant = 'default' | 'primary' | 'ghost' | 'danger'
export type IconButtonSize = 'sm' | 'md' | 'lg'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  label: string
  variant?: IconButtonVariant
  size?: IconButtonSize
  dot?: boolean
  active?: boolean
}

export function IconButton({
  icon,
  label,
  variant = 'default',
  size = 'md',
  dot = false,
  active = false,
  className = '',
  title,
  ...props
}: IconButtonProps) {
  const classes = [
    'kk-iconbtn',
    `kk-iconbtn-${variant}`,
    size !== 'md' && `kk-iconbtn-${size}`,
    active && 'kk-iconbtn-active',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={classes}
      aria-label={label}
      title={title ?? label}
      {...props}
    >
      {icon}
      {dot && <span className="kk-iconbtn-dot" aria-hidden />}
    </button>
  )
}
