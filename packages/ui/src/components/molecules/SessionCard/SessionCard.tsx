import { Icon } from '../../atoms/Icon/Icon'
import { Badge, type BadgeVariant } from '../../atoms/Badge/Badge'
import { StatusDot, type StatusDotVariant } from '../../atoms/StatusDot/StatusDot'
import { Spinner } from '../../atoms/Spinner/Spinner'
import './SessionCard.css'

export type SessionStatus = 'running' | 'queued' | 'done' | 'failed' | 'cancelled'
export type SessionType = 'feature' | 'bug' | 'task'
export type SessionPreset = 'light' | 'sdd' | 'bmad' | 'speckit'

export interface SessionCardProps {
  /** Human-readable session title. */
  title: string
  /** Preset that drove the run. */
  preset: SessionPreset
  /** Lifecycle status of the session. */
  status: SessionStatus
  /** Human-readable updated timestamp, e.g. "2m ago" or "14 Jun 09:30". */
  updatedAt: string
  /** Optional human-readable creation timestamp. */
  createdAt?: string
  /** Worktree path; takes precedence over `branch` when both are provided. */
  worktreePath?: string
  /** Branch reference, e.g. `koklo/session/3f2a8c1e`. Shown when no worktree path. */
  branch?: string
  /** Work item type, rendered as a leading badge. */
  type?: SessionType
  /** Whether this card is the active selection in a list. */
  selected?: boolean
  onSelect?: () => void
  className?: string
}

interface StatusConfig {
  dot: StatusDotVariant
  label: string
  badge: BadgeVariant
  pulse?: boolean
  spinner?: boolean
}

const STATUS: Record<SessionStatus, StatusConfig> = {
  running:   { dot: 'active',  label: 'Running',   badge: 'amber',   pulse: true, spinner: true },
  queued:    { dot: 'pending', label: 'Queued',    badge: 'default' },
  done:      { dot: 'done',    label: 'Done',      badge: 'success' },
  failed:    { dot: 'offline', label: 'Failed',    badge: 'danger' },
  cancelled: { dot: 'offline', label: 'Cancelled', badge: 'default' },
}

const TYPE_VARIANT: Record<SessionType, BadgeVariant> = {
  feature: 'story',
  bug: 'bug',
  task: 'task',
}

const PRESET_LABEL: Record<SessionPreset, string> = {
  light: 'Light',
  sdd: 'SDD',
  bmad: 'BMAD',
  speckit: 'SpecKit',
}

export function SessionCard({
  title,
  preset,
  status,
  updatedAt,
  createdAt,
  worktreePath,
  branch,
  type,
  selected = false,
  onSelect,
  className = '',
}: SessionCardProps) {
  const cfg = STATUS[status]
  const sourceRef = worktreePath ?? branch
  const sourceIsWorktree = Boolean(worktreePath)

  return (
    <button
      type="button"
      className={['kk-session', selected && 'selected', className].filter(Boolean).join(' ')}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="kk-session-head">
        <span className="kk-session-title-wrap">
          {type && <Badge variant={TYPE_VARIANT[type]} size="sm">{type}</Badge>}
          <span className="kk-session-title">{title}</span>
        </span>
        <span className="kk-session-status">
          <StatusDot status={cfg.dot} pulse={cfg.pulse} />
          {cfg.spinner && <Spinner size={12} />}
          <Badge variant={cfg.badge} size="sm">{cfg.label}</Badge>
        </span>
      </span>

      {sourceRef && (
        <span
          className="kk-session-source"
          aria-label={`${sourceIsWorktree ? 'Worktree path' : 'Branch'}: ${sourceRef}`}
        >
          <Icon name={sourceIsWorktree ? 'Folder' : 'Branch'} size={12} aria-hidden />
          <span className="kk-session-source-ref" title={sourceRef}>{sourceRef}</span>
        </span>
      )}

      <span className="kk-session-foot">
        <Badge variant={preset === 'bmad' ? 'bmad' : 'default'} size="sm">{PRESET_LABEL[preset]}</Badge>
        <span className="kk-session-meta">
          <span className="kk-session-date">
            <Icon name="Clock" size={12} aria-hidden />
            Updated {updatedAt}
          </span>
          {createdAt && <span className="kk-session-date-sub">Created {createdAt}</span>}
        </span>
      </span>
    </button>
  )
}
