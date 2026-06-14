import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import './Modal.css'

export type ModalSize = 'sm' | 'md' | 'lg'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  size?: ModalSize
  children?: ReactNode
  actions?: ReactNode
}

export function Modal({ open, onClose, title, description, size = 'sm', children, actions }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  /* Close on Escape */
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  /* Trap focus on open */
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div
      className="kk-modal-layer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kk-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panelRef}
        className={`kk-modal kk-modal-${size}`}
        tabIndex={-1}
      >
        <h2 id="kk-modal-title" className="kk-modal-title">{title}</h2>
        {description && <p className="kk-modal-desc">{description}</p>}
        {children && <div className="kk-modal-body">{children}</div>}
        {actions && <div className="kk-modal-actions">{actions}</div>}
      </div>
    </div>
  )
}
