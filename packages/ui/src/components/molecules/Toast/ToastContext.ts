import { createContext, useContext } from 'react'
import type { ToastItem } from './Toast'

export interface ToasterContextValue {
  toast: (item: Omit<ToastItem, 'id'>) => void
}

export const ToasterContext = createContext<ToasterContextValue | null>(null)

export function useToast() {
  const context = useContext(ToasterContext)
  if (!context) throw new Error('useToast must be used inside <Toaster>')
  return context
}
