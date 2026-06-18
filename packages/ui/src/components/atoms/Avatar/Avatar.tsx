import type { CSSProperties } from 'react'
import './Avatar.css'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export type AvatarShape = 'circle' | 'square'

export interface AvatarProps {
  name: string
  color?: string
  src?: string
  size?: AvatarSize
  shape?: AvatarShape
  ring?: boolean
  className?: string
  style?: CSSProperties
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const defaultColors = [
  '#1E3A5F', '#C2410C', '#15803D', '#7C3AED', '#0891B2', '#B45309',
  '#BE185D', '#1D4ED8', '#065F46', '#6D28D9',
]

function colorFromName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return defaultColors[Math.abs(hash) % defaultColors.length]
}

export function Avatar({
  name,
  color,
  src,
  size = 'md',
  shape = 'circle',
  ring = false,
  className = '',
  style,
}: AvatarProps) {
  const bg = color ?? colorFromName(name)
  const classes = ['kk-avatar', `kk-avatar-${size}`, shape === 'square' && 'kk-avatar-square', ring && 'kk-avatar-ring', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      style={{ backgroundColor: src ? undefined : bg, ...style }}
      title={name}
      aria-label={name}
    >
      {src ? (
        <img src={src} alt={name} />
      ) : (
        getInitials(name)
      )}
    </div>
  )
}
