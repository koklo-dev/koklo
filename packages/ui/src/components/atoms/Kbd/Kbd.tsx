import type { ReactNode } from 'react'
import './Kbd.css'

export interface KbdProps {
  children: ReactNode
  className?: string
}

export function Kbd({ children, className = '' }: KbdProps) {
  return <kbd className={`kk-kbd ${className}`}>{children}</kbd>
}
