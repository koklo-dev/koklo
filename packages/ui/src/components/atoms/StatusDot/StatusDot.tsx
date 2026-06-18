import './StatusDot.css'

export type StatusDotVariant = 'connected' | 'reconnecting' | 'offline' | 'active' | 'done' | 'pending'

export interface StatusDotProps {
  status: StatusDotVariant
  label?: string
  pulse?: boolean
  size?: number
}

const colorMap: Record<StatusDotVariant, string> = {
  connected:    'var(--color-success)',
  reconnecting: 'var(--color-warning)',
  offline:      'var(--color-fg-muted)',
  active:       'var(--color-accent)',
  done:         'var(--color-success)',
  pending:      'var(--color-border)',
}

export function StatusDot({ status, label, pulse, size = 8 }: StatusDotProps) {
  return (
    <span className={`kk-status-dot-wrap ${pulse ? 'kk-status-pulse' : ''}`}>
      <span
        className="kk-status-dot"
        style={{ width: size, height: size, background: colorMap[status] }}
        aria-label={label ?? status}
      />
      {label && <span className="kk-status-dot-label">{label}</span>}
    </span>
  )
}
