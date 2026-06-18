import type { InputHTMLAttributes, ReactNode } from 'react'
import './Input.css'

export type InputSize = 'sm' | 'md' | 'lg'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: InputSize
  error?: string
  icon?: ReactNode
  adornment?: ReactNode
}

export function Input({
  size = 'md',
  error,
  icon,
  adornment,
  className = '',
  ...props
}: InputProps) {
  const inputClass = [
    'kk-input',
    size !== 'md' && `kk-input-${size}`,
    error && 'kk-input-error',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const input = <input className={inputClass} aria-invalid={!!error} {...props} />

  if (icon || adornment) {
    return (
      <div>
        <div className="kk-input-wrapper">
          {icon && <span className="kk-input-icon">{icon}</span>}
          {input}
          {adornment && <span className="kk-input-adornment">{adornment}</span>}
        </div>
        {error && <p className="kk-input-error-msg" role="alert">{error}</p>}
      </div>
    )
  }

  return (
    <div>
      {input}
      {error && <p className="kk-input-error-msg" role="alert">{error}</p>}
    </div>
  )
}
