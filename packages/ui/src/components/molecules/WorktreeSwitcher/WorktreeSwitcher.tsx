import { useEffect, useRef, useState } from 'react'
import { Badge } from '../../atoms/Badge/Badge'
import { Icon } from '../../atoms/Icon/Icon'
import { IconButton } from '../../atoms/IconButton/IconButton'
import './WorktreeSwitcher.css'

export interface WorktreeSwitcherItem {
  id: string
  title: string
  branch: string
  path: string
  status: string
  isActive: boolean
  canPrune?: boolean
}

export interface WorktreeSwitcherProps {
  items: WorktreeSwitcherItem[]
  busyItemId?: string | null
  busyAction?: 'switch' | 'prune' | null
  onSelect?: (item: WorktreeSwitcherItem) => void
  onPrune?: (item: WorktreeSwitcherItem) => void
}

function stateLabel(items: readonly WorktreeSwitcherItem[]): string {
  if (items.length === 0) return 'Project tree'
  const active = items.find((item) => item.isActive) ?? items[0]
  return active.branch || active.title
}

function statusVariant(status: string): 'amber' | 'success' | 'danger' | 'default' {
  switch (status.toLowerCase()) {
    case 'running':
    case 'queued':
    case 'pending':
    case 'in_progress':
      return 'amber'
    case 'completed':
    case 'done':
      return 'success'
    case 'failed':
    case 'cancelled':
      return 'danger'
    default:
      return 'default'
  }
}

export function WorktreeSwitcher({
  items,
  busyItemId = null,
  busyAction = null,
  onSelect,
  onPrune,
}: WorktreeSwitcherProps) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const activeCount = items.length
  const activeLabel = stateLabel(items)

  return (
    <div className="kk-worktree-switcher">
      <button
        ref={buttonRef}
        type="button"
        className={`kk-worktree-trigger ${open ? 'kk-worktree-trigger-open' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open worktree switcher"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="kk-worktree-trigger-icon">
          <Icon name="Branch" size={14} aria-hidden />
        </span>
        <span className="kk-worktree-trigger-copy">
          <span className="kk-worktree-trigger-label">Worktree</span>
          <span className="kk-worktree-trigger-value">{activeLabel}</span>
        </span>
        {activeCount > 0 && (
          <Badge variant="default" size="sm">
            {activeCount}
          </Badge>
        )}
        <Icon name="ChevronDown" size={13} aria-hidden />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="kk-worktree-panel"
          role="dialog"
          aria-label="Worktree switcher"
        >
          <div className="kk-worktree-panel-head">
            <div>
              <p className="kk-worktree-eyebrow">Session isolation</p>
              <h3>Worktrees</h3>
            </div>
            <Badge variant="default" size="sm">
              {items.length === 0 ? 'none' : `${items.length} active`}
            </Badge>
          </div>

          {items.length === 0 ? (
            <p className="kk-worktree-empty">
              No isolated worktrees yet. Start a session to create one.
            </p>
          ) : (
            <div className="kk-worktree-list">
              {items.map((item) => {
                const switching = busyItemId === item.id && busyAction === 'switch'
                const pruning = busyItemId === item.id && busyAction === 'prune'
                return (
                  <div key={item.id} className={`kk-worktree-row ${item.isActive ? 'is-active' : ''}`}>
                    <button
                      type="button"
                      className="kk-worktree-select"
                      onClick={() => {
                        onSelect?.(item)
                        setOpen(false)
                      }}
                      disabled={switching || pruning}
                    >
                      <span className="kk-worktree-row-main">
                        <span className="kk-worktree-row-title">{item.title}</span>
                        <span className="kk-worktree-row-branch">{item.branch}</span>
                        <span className="kk-worktree-row-path" title={item.path}>
                          {item.path}
                        </span>
                      </span>
                      <span className="kk-worktree-row-meta">
                        {item.isActive && (
                          <Badge variant="success" size="sm">
                            Active
                          </Badge>
                        )}
                        <Badge variant={statusVariant(item.status)} size="sm">
                          {item.status}
                        </Badge>
                      </span>
                    </button>

                    {item.canPrune && (
                      <IconButton
                        icon={<Icon name="Trash" size={13} aria-hidden />}
                        label={`Prune ${item.branch}`}
                        variant="ghost"
                        disabled={switching || pruning}
                        onClick={() => onPrune?.(item)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
