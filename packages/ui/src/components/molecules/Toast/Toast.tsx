import { useEffect, useCallback, useRef, useState, type ReactNode } from 'react'
import { ToasterContext } from './ToastContext'
import './Toast.css'

export type ToastTone = 'success' | 'warning' | 'danger' | 'info'

export interface ToastItem {
  id: string
  title: string
  description?: string
  tone?: ToastTone
  duration?: number
}

/* ── Single Toast ─────────────────────────────────────── */

export interface ToastProps {
  title: string
  description?: string
  tone?: ToastTone
  onDismiss?: () => void
}

export function Toast({ title, description, tone = 'success', onDismiss }: ToastProps) {
  return (
    <div className={`kk-toast kk-toast-${tone}`} role="alert" aria-live="polite">
      <span className="kk-toast-dot" aria-hidden="true" />
      <div className="kk-toast-body">
        <strong className="kk-toast-title">{title}</strong>
        {description && <p className="kk-toast-desc">{description}</p>}
      </div>
      {onDismiss && (
        <button className="kk-toast-close" onClick={onDismiss} aria-label="Fermer">
          ✕
        </button>
      )}
    </div>
  )
}

/* ── Toaster (region + imperative API) ───────────────── */

export interface ToasterProps {
  children?: ReactNode
  defaultDuration?: number
}

export function Toaster({ children, defaultDuration = 4000 }: ToasterProps) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setItems(prev => prev.filter(t => t.id !== id))
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
  }, [])

  const toast = useCallback((item: Omit<ToastItem, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const duration = item.duration ?? defaultDuration
    setItems(prev => [...prev, { ...item, id }])
    if (duration > 0) {
      timers.current.set(id, setTimeout(() => dismiss(id), duration))
    }
  }, [defaultDuration, dismiss])

  useEffect(() => {
    const map = timers.current
    return () => { map.forEach(clearTimeout) }
  }, [])

  return (
    <ToasterContext.Provider value={{ toast }}>
      {children}
      <div className="kk-toast-region" aria-label="Notifications">
        {items.map(item => (
          <Toast
            key={item.id}
            title={item.title}
            description={item.description}
            tone={item.tone}
            onDismiss={() => dismiss(item.id)}
          />
        ))}
      </div>
    </ToasterContext.Provider>
  )
}
