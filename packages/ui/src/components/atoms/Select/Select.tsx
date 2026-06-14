import { useState, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import './Select.css'

export interface SelectOption {
  value: string
  label: string
  icon?: ReactNode
  color?: string
}

export interface SelectProps {
  options: SelectOption[]
  value?: string
  placeholder?: string
  onChange?: (value: string) => void
  disabled?: boolean
  size?: 'sm' | 'md'
}

export function Select({ options, value, placeholder = 'Select…', onChange, disabled, size = 'md' }: SelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} className={`kk-select ${open ? 'kk-select-open' : ''} kk-select-${size}`}>
      <button
        type="button"
        className="kk-select-trigger"
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected?.icon && <span className="kk-select-icon">{selected.icon}</span>}
        {selected?.color && (
          <span className="kk-select-color-dot" style={{ background: selected.color }} />
        )}
        <span className={selected ? '' : 'kk-select-placeholder'}>
          {selected?.label ?? placeholder}
        </span>
        <Icon name="ChevronDown" size={12} />
      </button>
      {open && (
        <div className="kk-select-menu" role="listbox">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={['kk-select-item', opt.value === value && 'kk-select-item-active'].filter(Boolean).join(' ')}
              onClick={() => { onChange?.(opt.value); setOpen(false) }}
            >
              {opt.icon && <span className="kk-select-icon">{opt.icon}</span>}
              {opt.color && <span className="kk-select-color-dot" style={{ background: opt.color }} />}
              {opt.label}
              {opt.value === value && <Icon name="Check" size={12} style={{ marginLeft: 'auto' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
