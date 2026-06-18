import type { InputHTMLAttributes } from 'react'
import { Icon } from '../Icon/Icon'
import { Kbd } from '../Kbd/Kbd'
import { Input } from '../Input/Input'

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size'> {
  kbdHint?: string
  onChange?: (value: string) => void
  size?: 'sm' | 'md' | 'lg'
}

export function SearchInput({
  value,
  placeholder = 'Search…',
  kbdHint,
  onChange,
  onKeyDown,
  className,
  size = 'md',
  ...props
}: SearchInputProps) {
  return (
    <Input
      size={size}
      value={value}
      placeholder={placeholder}
      icon={<Icon name="Search" size={13} />}
      adornment={kbdHint ? <Kbd>{kbdHint}</Kbd> : undefined}
      onChange={e => onChange?.(e.target.value)}
      onKeyDown={onKeyDown}
      className={className}
      {...props}
    />
  )
}
