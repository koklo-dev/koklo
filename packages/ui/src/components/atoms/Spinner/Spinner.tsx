import './Spinner.css'

export interface SpinnerProps {
  size?: number
  color?: string
  className?: string
}

export function Spinner({ size = 16, color = 'currentColor', className = '' }: SpinnerProps) {
  return (
    <span
      className={`kk-spinner ${className}`}
      style={{ width: size, height: size, borderColor: color, borderTopColor: 'transparent' }}
      role="status"
      aria-label="Loading"
    />
  )
}
