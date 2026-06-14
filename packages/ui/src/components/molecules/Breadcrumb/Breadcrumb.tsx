import { Fragment } from 'react'
import { Avatar } from '../../atoms/Avatar/Avatar'
import { Icon } from '../../atoms/Icon/Icon'
import './Breadcrumb.css'

export interface BreadcrumbItem {
  label: string
  href?: string
  avatarColor?: string
  isOrg?: boolean
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[]
  onItemClick?: (item: BreadcrumbItem, index: number) => void
}

export function Breadcrumb({ items, onItemClick }: BreadcrumbProps) {
  return (
    <nav className="kk-breadcrumb" aria-label="Breadcrumb">
      <ol className="kk-breadcrumb-list">
        {items.map((item, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <li className="kk-breadcrumb-sep" aria-hidden>
                <Icon name="ChevronRight" size={12} />
              </li>
            )}
            <li className="kk-breadcrumb-item">
              {item.isOrg && item.avatarColor && (
                <Avatar
                  name={item.label}
                  color={item.avatarColor}
                  size="xs"
                  shape="square"
                  className="kk-breadcrumb-avatar"
                />
              )}
              <button
                type="button"
                className={[
                  'kk-breadcrumb-btn',
                  i === items.length - 1 && 'kk-breadcrumb-current',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onItemClick?.(item, i)}
                aria-current={i === items.length - 1 ? 'page' : undefined}
              >
                {item.label}
              </button>
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  )
}
